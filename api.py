"""
World Cup 2026 Simulation API
==============================
Endpoints:
  GET  /                          Health check
  GET  /api/simulate_tournament   Read pre-generated results CSV
  POST /api/predict_match         Single match prediction
  POST /api/what_if_predict       Injury/adjustment what-if match prediction
  GET  /api/leaderboard           AI vs FIFA rank sleepers
  GET  /api/squads                All 48 team squads with player ratings
  POST /api/injure_player         Mark a player as injured (recomputes team rating)
  POST /api/restore_player        Restore an injured player
  POST /api/run_simulation        Run N sims in background (returns immediately)
  GET  /api/simulation_stream     SSE stream — live win% updates as sims complete
  POST /api/stop_simulation       Abort running simulation
  GET  /api/simulation_status     Current progress (pct, results)
"""

import time
import json
import math
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager
from pathlib import Path
from collections import defaultdict

import predict_wc
import feature_engineering

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path("data")
SQUAD_CSV = DATA_DIR / "WC2026_Squads_EAFC26_Ratings.csv"
RATINGS_CSV = DATA_DIR / "squad_team_ratings.csv"

# Exponential weighting alpha (same as compute_team_ratings.py)
ALPHA = 0.15

# Confederation mapping for frontend colouring
CONFEDERATION_MAP = {
    "UEFA":     ["France","Germany","Spain","England","Portugal","Netherlands","Belgium",
                 "Croatia","Austria","Czechia","Serbia","Switzerland","Denmark","Sweden",
                 "Norway","Turkey","Scotland","Ukraine","Bosnia-Herzegovina","Slovakia"],
    "CONMEBOL": ["Brazil","Argentina","Colombia","Uruguay","Ecuador","Chile","Paraguay",
                 "Bolivia","Venezuela","Peru"],
    "CAF":      ["Morocco","Senegal","Algeria","Egypt","Ghana","Ivory Coast","Cameroon",
                 "Tunisia","Nigeria","South Africa","DR Congo","Cape Verde"],
    "CONCACAF": ["United States","Mexico","Canada","Jamaica","Honduras","El Salvador",
                 "Costa Rica","Haiti","Panama","Trinidad and Tobago","Curacao"],
    "AFC":      ["Japan","South Korea","Iran","Saudi Arabia","Australia","Qatar","Iraq",
                 "Jordan","Uzbekistan","New Zealand"],
    "OFC":      ["New Zealand"],
}

def get_confederation(team: str) -> str:
    for conf, teams in CONFEDERATION_MAP.items():
        if team in teams:
            return conf
    return "OTHER"


def row_dict_to_features(row_dict: dict, feature_cols: list, wc_medians: dict) -> list:
    """
    Convert a build_match_row result dict into an ordered feature list.

    BUG FIX: previously used `row_dict.get(col, 0) ... else 0` which set any
    missing or NaN feature to 0.  For EA squad ratings (real range 69–85) that
    made teams without EA data (e.g. United States) look catastrophically weak,
    causing impossible upsets in the simulation.  Now falls back to the column
    median from the WC feature CSV, which keeps missing teams at average strength.
    """
    features = []
    for col in feature_cols:
        val = row_dict.get(col, None)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            val = wc_medians.get(col, 0.0)
        features.append(float(val))
    return features


# ── Squad rating helpers ───────────────────────────────────────────────────────

def exp_weighted_mean(ratings: list) -> float:
    """Exponentially-weighted mean — higher rated players carry more weight."""
    if not ratings:
        return 0.0
    r = np.array(ratings, dtype=float)
    w = np.exp(ALPHA * (r - r.min()))
    return float(np.dot(w, r) / w.sum())


def compute_team_rating_from_squad(players: list) -> dict:
    """
    Given a list of player dicts {name, position, overall, injured},
    compute aggregated team ratings matching squad_team_ratings.csv schema.
    Injured players are excluded from computation.
    """
    active = [p for p in players if not p.get("injured", False)]
    if not active:
        return {"overall": 60.0, "attack": 60.0, "midfield": 60.0, "defense": 60.0}

    gk_r  = [p["overall"] for p in active if p["position"] == "GK"]
    def_r = [p["overall"] for p in active if p["position"] == "DEF"]
    mid_r = [p["overall"] for p in active if p["position"] == "MID"]
    fwd_r = [p["overall"] for p in active if p["position"] == "FWD"]
    all_r = [p["overall"] for p in active]

    overall  = exp_weighted_mean(all_r)
    attack   = exp_weighted_mean(fwd_r) if fwd_r else overall
    midfield = exp_weighted_mean(mid_r) if mid_r else overall
    def_part = exp_weighted_mean(def_r) if def_r else overall
    gk_part  = exp_weighted_mean(gk_r)  if gk_r  else overall
    defense  = 0.8 * def_part + 0.2 * gk_part

    return {
        "overall":  round(overall, 2),
        "attack":   round(attack, 2),
        "midfield": round(midfield, 2),
        "defense":  round(defense, 2),
    }


def build_squad_state(squad_csv: Path) -> dict:
    """
    Load WC2026_Squads_EAFC26_Ratings.csv into an in-memory squad state dict:
      { team_name: [ {name, position, overall, pac, sho, pas, dri, def_, phy, source, injured}, ... ] }
    """
    df = pd.read_csv(squad_csv)
    state = {}
    for team, grp in df.groupby("Team"):
        players = []
        for _, row in grp.iterrows():
            players.append({
                "name":     row["Player"],
                "position": str(row["Position"]).strip().upper(),
                "overall":  int(row["Overall"]),
                "pac":      int(row.get("PAC", 0)),
                "sho":      int(row.get("SHO", 0)),
                "pas":      int(row.get("PAS", 0)),
                "dri":      int(row.get("DRI", 0)),
                "def_":     int(row.get("DEF", 0)),
                "phy":      int(row.get("PHY", 0)),
                "source":   str(row.get("Rating_Source", "Estimated")),
                "injured":  False,
            })
        state[team] = players
    return state


def build_computed_ratings(squad_state: dict) -> dict:
    """Build {team: {overall, attack, midfield, defense}} from current squad state."""
    return {team: compute_team_rating_from_squad(players)
            for team, players in squad_state.items()}


def ratings_to_df(computed_ratings: dict) -> pd.DataFrame:
    """Convert computed ratings dict into a DataFrame matching ea_df schema."""
    rows = []
    for team, r in computed_ratings.items():
        rows.append({
            "team":     team,
            "overall":  r["overall"],
            "attack":   r["attack"],
            "midfield": r["midfield"],
            "defense":  r["defense"],
        })
    return pd.DataFrame(rows)


# ── App lifecycle ─────────────────────────────────────────────────────────────

app_state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading models and data for API...")
    om, gh_model, ga_model, feature_cols, wc, teams_df, ea_df, sq_df = predict_wc.load_all()
    elo_map = dict(zip(teams_df["team"], teams_df["elo_rating"]))

    print("Pre-computing fixture probabilities...")
    fixture_data, ko_lookup, elo_map = predict_wc.precompute_group_probs(
        wc, teams_df, om, gh_model, ga_model, feature_cols, elo_map,
        ea_df=ea_df, sq_df=sq_df)

    app_state["om"]           = om
    app_state["gh_model"]     = gh_model
    app_state["ga_model"]     = ga_model
    app_state["feature_cols"] = feature_cols
    app_state["wc"]           = wc
    app_state["teams_df"]     = teams_df
    app_state["ea_df"]        = ea_df
    app_state["elo_map"]      = elo_map
    app_state["fixture_data"] = fixture_data
    app_state["ko_lookup"]    = ko_lookup
    # Pre-compute column medians from the WC feature CSV.
    # Used everywhere instead of hard-coding 0 as the NaN fallback — a value of 0
    # for ea_overall (real range 69–85) made teams like USA look catastrophically
    # weak and caused upsets like Ivory Coast or USA winning the tournament.
    app_state["wc_medians"]   = wc[feature_cols].median().to_dict()

    # Feature engineering static data for what-if
    print("Loading base features for what-if simulator...")
    results, teams, elo_ts, ea, squad = feature_engineering.load_data()
    app_state["fe_results"]    = results
    app_state["fe_elo_lookup"] = feature_engineering.build_elo_lookup(elo_ts)
    app_state["fe_form_df"]    = feature_engineering.compute_rolling_form(results)
    app_state["fe_h2h"]        = feature_engineering.compute_h2h(results)
    app_state["fe_static"]     = feature_engineering.build_static_features(teams, ea, squad)

    # Squad state — loaded from player-level CSV
    print("Loading squad state from WC2026_Squads_EAFC26_Ratings.csv...")
    app_state["squad_state"]      = build_squad_state(SQUAD_CSV)
    app_state["computed_ratings"] = build_computed_ratings(app_state["squad_state"])

    print("API Ready.")
    yield
    app_state.clear()


app = FastAPI(title="World Cup 2026 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fifa-sigma-eight.vercel.app", # Your Vercel URL
        "http://localhost:5173",               # Local Vite
        "http://localhost:3000"                # Local Standard React
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# EXISTING ENDPOINTS (preserved)
# =============================================================================

@app.get("/")
@app.head("/")
def read_root():
    return {"status": "ok", "message": "World Cup 2026 API is running."}





# =============================================================================
# NEW SQUAD ENDPOINTS
# =============================================================================

@app.get("/api/squads")
def get_squads():
    """
    Return all 48 team squads with:
      - Full player roster (name, position, overall, individual stats, injured)
      - Current aggregated team rating (recomputed from live squad state)
      - Confederation tag
    """
    squad_state      = app_state["squad_state"]
    computed_ratings = app_state["computed_ratings"]

    teams_out = []
    for team, players in squad_state.items():
        rating = computed_ratings.get(team, {"overall":70,"attack":70,"midfield":70,"defense":70})
        teams_out.append({
            "team":          team,
            "confederation": get_confederation(team),
            "rating":        rating,
            "players":       players,
        })

    # Sort alphabetically since static win percentages are removed
    teams_out.sort(key=lambda x: x["team"])
    return {"teams": teams_out}


class PlayerActionRequest(BaseModel):
    team:   str
    player: str   # player name


@app.post("/api/injure_player")
def injure_player(req: PlayerActionRequest):
    """Mark a player as injured and recompute the team's aggregated rating."""
    squad_state = app_state["squad_state"]
    if req.team not in squad_state:
        raise HTTPException(status_code=404, detail=f"Team '{req.team}' not found")

    players = squad_state[req.team]
    matched = [p for p in players if p["name"] == req.player]
    if not matched:
        raise HTTPException(status_code=404, detail=f"Player '{req.player}' not found in {req.team}")

    matched[0]["injured"] = True

    # Recompute rating
    new_rating = compute_team_rating_from_squad(players)
    app_state["computed_ratings"][req.team] = new_rating

    # Update the live ea_df used by penalty_win_prob etc.
    _update_ea_df(req.team, new_rating)

    return {
        "status":     "injured",
        "team":       req.team,
        "player":     req.player,
        "new_rating": new_rating,
    }


@app.post("/api/restore_player")
def restore_player(req: PlayerActionRequest):
    """Restore an injured player and recompute the team's aggregated rating."""
    squad_state = app_state["squad_state"]
    if req.team not in squad_state:
        raise HTTPException(status_code=404, detail=f"Team '{req.team}' not found")

    players = squad_state[req.team]
    matched = [p for p in players if p["name"] == req.player]
    if not matched:
        raise HTTPException(status_code=404, detail=f"Player '{req.player}' not found in {req.team}")

    matched[0]["injured"] = False

    new_rating = compute_team_rating_from_squad(players)
    app_state["computed_ratings"][req.team] = new_rating
    _update_ea_df(req.team, new_rating)

    return {
        "status":     "restored",
        "team":       req.team,
        "player":     req.player,
        "new_rating": new_rating,
    }


def _update_ea_df(team: str, new_rating: dict):
    """Keep app_state ea_df in sync so penalty_win_prob() uses fresh ratings."""
    ea_df = app_state["ea_df"]
    mask  = ea_df["team"] == team
    if mask.any():
        ea_df.loc[mask, "overall"]  = new_rating["overall"]
        ea_df.loc[mask, "attack"]   = new_rating["attack"]
        ea_df.loc[mask, "midfield"] = new_rating["midfield"]
        ea_df.loc[mask, "defense"]  = new_rating["defense"]
    else:
        # Team missing in ea_df (shouldn't happen, but guard anyway)
        new_row = pd.DataFrame([{"team": team, **new_rating}])
        app_state["ea_df"] = pd.concat([ea_df, new_row], ignore_index=True)


# =============================================================================
# NEW SQUAD ENDPOINTS
# =============================================================================


# ── Single Tournament Simulator ──────────────────────────────────────────────

GROUPS = list("ABCDEFGHIJKL")

single_tournament = {
    "stage": "not_started", # not_started → group_stage → r32 → r16 → qf → sf → third_place → final → finished
    "fixtures": {},         # stage_name -> list of matches
    "standings": {},        # group_name -> list of team standing dicts
    "third_place_standings": [],
    "r32_winners": [],
    "r16_winners": [],
    "qf_winners": [],
    "sf_winners": [],
    "third_place_winner": None,
    "champion": None,
    "seed": 42
}

def sample_ko_match_detailed(home, away, form_tracker, rng, ea_df):
    """Simulate a knockout match and return rich metadata about goals/extra time/shootouts."""
    
    # Use full feature engineering instead of the bugged np.zeros in make_ko_features
    fe_static_copy = app_state["fe_static"].copy(deep=True)
    # Get live ea ratings in case of injuries
    for t in [home, away]:
        live_mask = ea_df["team"] == t
        if live_mask.any():
            static_mask = fe_static_copy["team"] == t
            if static_mask.any():
                fe_static_copy.loc[static_mask, "ea_attack"] = ea_df.loc[live_mask, "attack"].values[0]
                fe_static_copy.loc[static_mask, "ea_defense"] = ea_df.loc[live_mask, "defense"].values[0]
                fe_static_copy.loc[static_mask, "ea_midfield"] = ea_df.loc[live_mask, "midfield"].values[0]

    row_dict = feature_engineering.build_match_row(
        home, away, "2026-06-11", True, "FIFA World Cup",
        app_state["fe_elo_lookup"], app_state["fe_form_df"],
        app_state["fe_h2h"], fe_static_copy
    )
    
    # Inject momentum
    if form_tracker is not None:
        elo_h = row_dict["elo_home"] + form_tracker.momentum_bonus(home)
        elo_a = row_dict["elo_away"] + form_tracker.momentum_bonus(away)
        row_dict["elo_diff"] = elo_h - elo_a
        row_dict["elo_win_prob_h"] = feature_engineering.win_probability(elo_h + 100, elo_a)
        row_dict["elo_win_prob_a"] = 1.0 - row_dict["elo_win_prob_h"]

    row_features = row_dict_to_features(
        row_dict, app_state["feature_cols"], app_state["wc_medians"])
    row_np = np.array([row_features], dtype=np.float32)

    probs = app_state["om"].predict_proba(row_np)[0]
    exp_h = float(np.clip(app_state["gh_model"].predict(row_np)[0], 0.3, 8))
    exp_a = float(np.clip(app_state["ga_model"].predict(row_np)[0], 0.3, 8))
    fd = {"p_H": probs[2], "p_D": probs[1], "p_A": probs[0], "exp_h": exp_h, "exp_a": exp_a}

    gh_90, ga_90 = predict_wc.sample_match(fd, rng)
    gh_total = gh_90
    ga_total = ga_90
    extra_time = False
    penalties = False
    pen_winner = None
    win_reason = "90m"
    pen_home_score = 0
    pen_away_score = 0

    if gh_90 == ga_90:
        extra_time = True
        et_h, et_a = predict_wc.sample_extra_time(fd, rng)
        gh_total += et_h
        ga_total += et_a
        win_reason = "ET"

        if gh_total == ga_total:
            penalties = True
            win_reason = "penalties"
            p_home = predict_wc.penalty_win_prob(home, away, ea_df)
            
            # Simple shootout scoring simulation
            if rng.random() < p_home:
                winner = home
                pen_winner = home
                pen_home_score = 5
                pen_away_score = rng.choice([3, 4])
            else:
                winner = away
                pen_winner = away
                pen_home_score = rng.choice([3, 4])
                pen_away_score = 5
        else:
            winner = home if gh_total > ga_total else away
    else:
        winner = home if gh_90 > ga_90 else away

    return {
        "home_goals": gh_total,
        "away_goals": ga_total,
        "home_goals_90": gh_90,
        "away_goals_90": ga_90,
        "extra_time": extra_time,
        "penalties": penalties,
        "pen_winner": pen_winner,
        "pen_home_score": int(pen_home_score),
        "pen_away_score": int(pen_away_score),
        "winner": winner,
        "win_reason": win_reason
    }


@app.post("/api/tournament/start")
def start_tournament(seed: Optional[int] = None):
    """Reset the step-by-step tournament simulation to the Group Stage."""
    if "teams_df" not in app_state or "fixture_data" not in app_state:
        raise HTTPException(status_code=503, detail="API models/data not fully loaded yet.")
        
    teams_df = app_state["teams_df"]
    fixture_data = app_state["fixture_data"]
    
    selected_seed = seed if seed is not None else int(time.time() * 1000) % 100000
    single_tournament["seed"] = selected_seed
    
    # Initialize Group Stage Fixtures
    wc = app_state.get("wc")
    group_fixtures = []
    for idx, fd in enumerate(fixture_data):
        # Resolve the match date from the wc dataframe
        date_val = ""
        if wc is not None:
            mask = (wc["home_team"] == fd["home"]) & (wc["away_team"] == fd["away"])
            if mask.any() and "date" in wc.columns:
                date_val = str(wc[mask].iloc[0]["date"])
        group_fixtures.append({
            "id": f"group_{fd['group']}_{idx}",
            "home": fd["home"],
            "away": fd["away"],
            "group": fd["group"],
            "date": date_val,
            "venue": f"{fd['city']}, {fd['country']}",
            "home_goals": None,
            "away_goals": None,
            "played": False,
            "winner": None,
            "win_reason": None,
            "extra_time": False,
            "penalties": False
        })
    
    # Initialize Group Standings
    standings = {}
    for group in GROUPS:
        g_teams = teams_df[teams_df["group"] == group]["team"].tolist()
        standings[group] = [
            {"team": t, "played": 0, "won": 0, "drawn": 0, "lost": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
            for t in g_teams
        ]
        
    def create_tbd_fixtures(stage_name, count):
        fx = []
        for i in range(count):
            fx.append({
                "id": f"{stage_name}_tbd_{i}",
                "date": KO_SCHEDULE[stage_name][i] if i < len(KO_SCHEDULE[stage_name]) else "2026-07-19",
                "home": "TBD",
                "away": "TBD",
                "venue": "Neutral Venue",
                "home_goals": None,
                "away_goals": None,
                "played": False,
                "winner": None,
                "win_reason": None,
                "extra_time": False,
                "penalties": False,
                "pen_winner": None,
                "pen_home_score": 0,
                "pen_away_score": 0,
                "stage": stage_name
            })
        return fx

    single_tournament.update({
        "stage": "group_stage",
        "fixtures": {
            "group_stage": group_fixtures,
            "r32": create_tbd_fixtures("r32", 16),
            "r16": create_tbd_fixtures("r16", 8),
            "qf": create_tbd_fixtures("qf", 4),
            "sf": create_tbd_fixtures("sf", 2),
            "third_place": create_tbd_fixtures("third_place", 1),
            "final": create_tbd_fixtures("final", 1)
        },
        "standings": standings,
        "third_place_standings": [],
        "r32_winners": [],
        "r16_winners": [],
        "qf_winners": [],
        "sf_winners": [],
        "third_place_winner": None,
        "champion": None
    })
    
    return {"status": "started", "stage": "group_stage", "seed": selected_seed}


@app.get("/api/tournament/state")
def get_tournament_state():
    """Get the current state of the step-by-step single tournament simulation."""
    return single_tournament


class SimulateDayRequest(BaseModel):
    match_ids: List[str]

@app.post("/api/tournament/simulate_day")
def simulate_day(req: SimulateDayRequest):
    stage = single_tournament["stage"]
    if stage == "not_started" or stage == "finished":
        raise HTTPException(status_code=400, detail="Tournament not started.")

    rng = np.random.default_rng(single_tournament["seed"])
    live_ea_df = ratings_to_df(app_state["computed_ratings"])
    
    fixtures = single_tournament["fixtures"][stage]
    fixture_data = app_state.get("fixture_data", [])
    fd_map = {(fd["home"], fd["away"]): fd for fd in fixture_data}
    
    form_tracker = predict_wc.FormTracker()
    for s in ["group_stage", "r32", "r16", "qf", "sf", "third_place"]:
        if s in single_tournament["fixtures"]:
            for m in single_tournament["fixtures"][s]:
                if m.get("played"):
                    form_tracker.update(m["home"], m["away"], m["home_goals"], m["away_goals"])

    for m in fixtures:
        if m["id"] in req.match_ids and not m["played"]:
            if stage == "group_stage":
                key = (m["home"], m["away"])
                fd = fd_map.get(key)
                if not fd:
                    fd = fd_map.get((m["away"], m["home"]))
                    if fd:
                        fd = {"p_H": fd["p_A"], "p_D": fd["p_D"], "p_A": fd["p_H"], "exp_h": fd["exp_a"], "exp_a": fd["exp_h"]}
                if not fd:
                    fd = {"p_H": 0.45, "p_D": 0.25, "p_A": 0.30, "exp_h": 1.5, "exp_a": 1.2}
                    
                gh, ga = predict_wc.sample_match(fd, rng)
                m["home_goals"] = int(gh)
                m["away_goals"] = int(ga)
                m["played"] = True
                
                if gh > ga:
                    m["winner"] = m["home"]
                    m["win_reason"] = "90m"
                elif ga > gh:
                    m["winner"] = m["away"]
                    m["win_reason"] = "90m"
                else:
                    m["winner"] = None
                    m["win_reason"] = "90m"
            else:
                res = sample_ko_match_detailed(m["home"], m["away"], form_tracker, rng, live_ea_df)
                m.update({
                    "home_goals": int(res["home_goals"]),
                    "away_goals": int(res["away_goals"]),
                    "played": True,
                    "winner": res["winner"],
                    "win_reason": res["win_reason"],
                    "extra_time": res["extra_time"],
                    "penalties": res["penalties"],
                    "pen_winner": res["pen_winner"],
                    "pen_home_score": int(res["pen_home_score"]),
                    "pen_away_score": int(res["pen_away_score"])
                })

    single_tournament["seed"] = int(single_tournament["seed"] * 31 + 17) % 1000000

    if stage == "group_stage":
        pts = defaultdict(int)
        gf = defaultdict(int)
        gd = defaultdict(int)
        won = defaultdict(int)
        drawn = defaultdict(int)
        lost = defaultdict(int)
        played = defaultdict(int)
        
        for m in fixtures:
            if m.get("played"):
                t1 = m["home"]
                t2 = m["away"]
                gh = m["home_goals"]
                ga = m["away_goals"]
                played[t1] += 1
                played[t2] += 1
                gf[t1] += gh
                gf[t2] += ga
                gd[t1] += (gh - ga)
                gd[t2] += (ga - gh)
                if gh > ga:
                    pts[t1] += 3
                    won[t1] += 1
                    lost[t2] += 1
                elif ga > gh:
                    pts[t2] += 3
                    won[t2] += 1
                    lost[t1] += 1
                else:
                    pts[t1] += 1
                    pts[t2] += 1
                    drawn[t1] += 1
                    drawn[t2] += 1

        group_standings = {}
        teams_df = app_state["teams_df"]
        for group in GROUPS:
            g_teams = teams_df[teams_df["group"] == group]["team"].tolist()
            group_stats = []
            for t in g_teams:
                group_stats.append({
                    "team": t,
                    "played": int(played[t]),
                    "won": int(won[t]),
                    "drawn": int(drawn[t]),
                    "lost": int(lost[t]),
                    "gf": int(gf[t]),
                    "ga": int(gf[t] - gd[t]),
                    "gd": int(gd[t]),
                    "pts": int(pts[t])
                })
            group_stats.sort(key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)
            single_tournament["standings"][group] = group_stats

    return {"status": "simulated_day", "stage": stage}

# ── 3. simulate_stage — full replacement ──────────────────────────────────────
@app.post("/api/tournament/simulate_stage")
def simulate_stage():
    """Simulate all matches for the current stage and advance to the next stage."""
    stage = single_tournament["stage"]
    if stage == "not_started":
        raise HTTPException(status_code=400, detail="Tournament not started.")
    if stage == "finished":
        return {
            "status": "finished",
            "message": "Tournament is already finished.",
            "champion": single_tournament["champion"],
        }
 
    if "teams_df" not in app_state or "fixture_data" not in app_state:
        raise HTTPException(status_code=503, detail="API models/data not fully loaded yet.")
 
    rng = np.random.default_rng(single_tournament["seed"])
    live_ea_df = ratings_to_df(app_state["computed_ratings"])
 
    # ── GROUP STAGE ────────────────────────────────────────────────────────────
    if stage == "group_stage":
        fixtures     = single_tournament["fixtures"]["group_stage"]
        fixture_data = app_state["fixture_data"]
        fd_map       = {(fd["home"], fd["away"]): fd for fd in fixture_data}
 
        pts = defaultdict(int);  gf = defaultdict(int)
        gd  = defaultdict(int);  won = defaultdict(int)
        drawn = defaultdict(int); lost = defaultdict(int)
        played = defaultdict(int)
 
        for m in fixtures:
            key = (m["home"], m["away"])
            fd  = fd_map.get(key)
            if not fd:
                fd = fd_map.get((m["away"], m["home"]))
                if fd:
                    fd = {"p_H": fd["p_A"], "p_D": fd["p_D"], "p_A": fd["p_H"],
                          "exp_h": fd["exp_a"], "exp_a": fd["exp_h"]}
            if not fd:
                fd = {"p_H": 0.45, "p_D": 0.25, "p_A": 0.30, "exp_h": 1.5, "exp_a": 1.2}
 
            if not m.get("played"):
                gh, ga = predict_wc.sample_match(fd, rng)
                m["home_goals"] = int(gh);  m["away_goals"] = int(ga)
                m["played"]     = True
                m["winner"]     = m["home"] if gh > ga else (m["away"] if ga > gh else None)
                m["win_reason"] = "90m"
            else:
                gh = m["home_goals"];  ga = m["away_goals"]
 
            played[m["home"]] += 1;  played[m["away"]] += 1
            gf[m["home"]] += gh;     gf[m["away"]] += ga
            gd[m["home"]] += gh - ga; gd[m["away"]] += ga - gh
            if gh > ga:
                pts[m["home"]] += 3;  won[m["home"]] += 1;  lost[m["away"]] += 1
            elif ga > gh:
                pts[m["away"]] += 3;  won[m["away"]] += 1;  lost[m["home"]] += 1
            else:
                pts[m["home"]] += 1;  pts[m["away"]] += 1
                drawn[m["home"]] += 1; drawn[m["away"]] += 1
 
        teams_df = app_state["teams_df"]
        group_standings = {}
        for group in GROUPS:
            g_teams = teams_df[teams_df["group"] == group]["team"].tolist()
            group_stats = [{
                "team": t, "played": int(played[t]), "won": int(won[t]),
                "drawn": int(drawn[t]), "lost": int(lost[t]),
                "gf": int(gf[t]), "ga": int(gf[t] - gd[t]), "gd": int(gd[t]), "pts": int(pts[t]),
            } for t in g_teams]
            group_stats.sort(key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)
            single_tournament["standings"][group] = group_stats
            group_standings[group] = [x["team"] for x in group_stats]
 
        # Best 8 third-place teams
        third_place_list = []
        for group in GROUPS:
            t = group_standings[group][2]
            third_place_list.append({
                "team": t, "group": group,
                "pts": int(pts[t]), "gd": int(gd[t]), "gf": int(gf[t]), "advanced": False,
            })
        third_place_list.sort(key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)
        advancing_3rd = []
        for idx2 in range(12):
            if idx2 < 8:
                third_place_list[idx2]["advanced"] = True
                advancing_3rd.append(third_place_list[idx2]["team"])
        single_tournament["third_place_standings"] = third_place_list
 
        # R32 pairings
        r32_pairs = []
        for i in range(4):
            r32_pairs.append((group_standings[GROUPS[i*2]][0],   advancing_3rd[i*2]))
            r32_pairs.append((group_standings[GROUPS[i]][1],     group_standings[GROUPS[7-i]][1]))
            r32_pairs.append((group_standings[GROUPS[i*2+1]][0], advancing_3rd[i*2+1]))
            r32_pairs.append((group_standings[GROUPS[8+i]][0],   group_standings[GROUPS[11-i]][1]))
 
        # ── FIX: add date from KO_SCHEDULE ────────────────────────────────────
        r32_fixtures = []
        for idx2, (h, a) in enumerate(r32_pairs):
            r32_fixtures.append({
                "id":             f"r32_{idx2}",
                "date":           KO_SCHEDULE["r32"][idx2] if idx2 < len(KO_SCHEDULE["r32"]) else "2026-06-28",
                "home":           h,
                "away":           a,
                "venue":          "Neutral Venue",
                "home_goals":     None,
                "away_goals":     None,
                "played":         False,
                "winner":         None,
                "win_reason":     None,
                "extra_time":     False,
                "penalties":      False,
                "pen_winner":     None,
                "pen_home_score": 0,
                "pen_away_score": 0,
            })
 
        single_tournament["fixtures"]["r32"] = r32_fixtures
        single_tournament["stage"]           = "r32"
 
    else:
        # ── KNOCKOUT STAGES ────────────────────────────────────────────────────
        fixtures = single_tournament["fixtures"][stage]
 
        form_tracker = predict_wc.FormTracker()
        for m in single_tournament["fixtures"]["group_stage"]:
            if m.get("played"):
                form_tracker.update(m["home"], m["away"], m["home_goals"], m["away_goals"])
        for s in ["r32", "r16", "qf", "sf", "third_place"]:
            for m in (single_tournament["fixtures"].get(s) or []):
                if m.get("played"):
                    form_tracker.update(m["home"], m["away"], m["home_goals"], m["away_goals"])
 
        winners = []
        for m in fixtures:
            if not m.get("played"):
                res = sample_ko_match_detailed(m["home"], m["away"], form_tracker, rng, live_ea_df)
                m.update({
                    "home_goals":     int(res["home_goals"]),
                    "away_goals":     int(res["away_goals"]),
                    "played":         True,
                    "winner":         res["winner"],
                    "win_reason":     res["win_reason"],
                    "extra_time":     res["extra_time"],
                    "penalties":      res["penalties"],
                    "pen_winner":     res["pen_winner"],
                    "pen_home_score": int(res["pen_home_score"]),
                    "pen_away_score": int(res["pen_away_score"]),
                })
            winners.append(m["winner"])
 
        if stage == "r32":
            single_tournament["r32_winners"] = winners
            r16_fixtures = []
            for i in range(0, 16, 2):
                idx2 = i // 2
                r16_fixtures.append({
                    "id":             f"r16_{idx2}",
                    "date":           KO_SCHEDULE["r16"][idx2] if idx2 < len(KO_SCHEDULE["r16"]) else "2026-07-04",
                    "home":           winners[i],
                    "away":           winners[i+1],
                    "venue":          "Neutral Venue",
                    "home_goals":     None, "away_goals": None,
                    "played":         False, "winner": None, "win_reason": None,
                    "extra_time":     False, "penalties": False,
                    "pen_winner":     None, "pen_home_score": 0, "pen_away_score": 0,
                })
            single_tournament["fixtures"]["r16"] = r16_fixtures
            single_tournament["stage"]           = "r16"
 
        elif stage == "r16":
            single_tournament["r16_winners"] = winners
            qf_fixtures = []
            for i in range(0, 8, 2):
                idx2 = i // 2
                qf_fixtures.append({
                    "id":             f"qf_{idx2}",
                    "date":           KO_SCHEDULE["qf"][idx2] if idx2 < len(KO_SCHEDULE["qf"]) else "2026-07-09",
                    "home":           winners[i],
                    "away":           winners[i+1],
                    "venue":          "Neutral Venue",
                    "home_goals":     None, "away_goals": None,
                    "played":         False, "winner": None, "win_reason": None,
                    "extra_time":     False, "penalties": False,
                    "pen_winner":     None, "pen_home_score": 0, "pen_away_score": 0,
                })
            single_tournament["fixtures"]["qf"] = qf_fixtures
            single_tournament["stage"]          = "qf"
 
        elif stage == "qf":
            single_tournament["qf_winners"] = winners
            sf_fixtures = []
            for i in range(0, 4, 2):
                idx2 = i // 2
                sf_fixtures.append({
                    "id":             f"sf_{idx2}",
                    "date":           KO_SCHEDULE["sf"][idx2] if idx2 < len(KO_SCHEDULE["sf"]) else "2026-07-14",
                    "home":           winners[i],
                    "away":           winners[i+1],
                    "venue":          "Neutral Venue",
                    "home_goals":     None, "away_goals": None,
                    "played":         False, "winner": None, "win_reason": None,
                    "extra_time":     False, "penalties": False,
                    "pen_winner":     None, "pen_home_score": 0, "pen_away_score": 0,
                })
            single_tournament["fixtures"]["sf"] = sf_fixtures
            single_tournament["stage"]          = "sf"
 
        elif stage == "sf":
            single_tournament["sf_winners"] = winners
            # Determine semi-final losers for the third-place play-off
            sf_losers = []
            for m in fixtures:
                if m.get("played") and m.get("winner"):
                    loser = m["away"] if m["winner"] == m["home"] else m["home"]
                    sf_losers.append(loser)
            # Third-place play-off (Jul 18)
            single_tournament["fixtures"]["third_place"] = [{
                "id":             "third_place_0",
                "date":           KO_SCHEDULE["third_place"][0],
                "home":           sf_losers[0] if len(sf_losers) > 0 else "TBD",
                "away":           sf_losers[1] if len(sf_losers) > 1 else "TBD",
                "venue":          "Estadio Azteca, Mexico City",
                "home_goals":     None, "away_goals": None,
                "played":         False, "winner": None, "win_reason": None,
                "extra_time":     False, "penalties": False,
                "pen_winner":     None, "pen_home_score": 0, "pen_away_score": 0,
            }]
            # Final (Jul 19)
            single_tournament["fixtures"]["final"] = [{
                "id":             "final_0",
                "date":           KO_SCHEDULE["final"][0],
                "home":           winners[0],
                "away":           winners[1],
                "venue":          "MetLife Stadium, New York/New Jersey",
                "home_goals":     None, "away_goals": None,
                "played":         False, "winner": None, "win_reason": None,
                "extra_time":     False, "penalties": False,
                "pen_winner":     None, "pen_home_score": 0, "pen_away_score": 0,
            }]
            single_tournament["stage"] = "third_place"
 
        elif stage == "third_place":
            single_tournament["third_place_winner"] = winners[0] if winners else None
            single_tournament["stage"] = "final"
 
        elif stage == "final":
            single_tournament["champion"] = winners[0]
            single_tournament["stage"]    = "finished"
 
    single_tournament["seed"] = int(single_tournament["seed"] * 31 + 17) % 1_000_000
 
    return {
        "status":           "simulated",
        "stage_completed":  stage,
        "next_stage":       single_tournament["stage"],
    }
 

# =============================================================================
# BATCH SIMULATION ENDPOINTS
# =============================================================================
KO_SCHEDULE = {
    # Round of 32 — Jun 28 – Jul 3 (16 matches, ~3 per day across 6 days)
    "r32": [
        "2026-06-28", "2026-06-28", "2026-06-28",
        "2026-06-29", "2026-06-29", "2026-06-29",
        "2026-06-30", "2026-06-30", "2026-06-30",
        "2026-07-01", "2026-07-01", "2026-07-01",
        "2026-07-02", "2026-07-02",
        "2026-07-03", "2026-07-03",
    ],
    # Round of 16 — Jul 5 – Jul 8 (8 matches, 2 per day across 4 days)
    "r16": [
        "2026-07-05", "2026-07-05",
        "2026-07-06", "2026-07-06",
        "2026-07-07", "2026-07-07",
        "2026-07-08", "2026-07-08",
    ],
    # Quarter-finals — Jul 9 & Jul 11 (4 matches, 2 per day)
    "qf": [
        "2026-07-09", "2026-07-09",
        "2026-07-11", "2026-07-11",
    ],
    # Semi-finals — Jul 14 – Jul 15 (2 matches, 1 per day)
    "sf": [
        "2026-07-14",
        "2026-07-15",
    ],
    # Third-place play-off — Jul 18
    "third_place": [
        "2026-07-18",
    ],
    # Final — Jul 19
    "final": [
        "2026-07-19",
    ],
}

@app.get("/api/group_fixtures")
def get_group_fixtures():
    """
    Return fixtures for display on the calendar.
    If the tournament is in progress, returns ALL stage fixtures (group + KO)
    with their dates so the July calendar shows knockout matches.
    """
    if "fixture_data" not in app_state:
        raise HTTPException(status_code=503, detail="API not ready.")
 
    # Tournament running — return everything with played status and dates
    if single_tournament.get("stage") not in ("not_started", None):
        all_fixtures = []
        for stage_key in ["group_stage", "r32", "r16", "qf", "sf", "third_place", "final"]:
            matches = single_tournament["fixtures"].get(stage_key, [])
            if not matches and stage_key in KO_SCHEDULE:
                # Dynamically inject placeholders for backwards compatibility if they haven't been seeded
                for i, d in enumerate(KO_SCHEDULE[stage_key]):
                    all_fixtures.append({
                        "id": f"{stage_key}_tbd_{i}",
                        "home": "TBD",
                        "away": "TBD",
                        "date": d,
                        "venue": "Neutral Venue",
                        "stage": stage_key,
                        "played": False,
                    })
            else:
                for m in matches:
                    all_fixtures.append({
                        "id":     m.get("id"),
                        "home":   m["home"],
                        "away":   m["away"],
                        "date":   m.get("date", ""),
                        "venue":  m.get("venue", ""),
                        "stage":  stage_key,
                        "played": bool(m.get("played")),
                    })
        return {"fixtures": all_fixtures}
 
    # Pre-game — group fixtures only, date from wc CSV
    wc = app_state["wc"]
    result = []
    for idx, fd in enumerate(app_state["fixture_data"]):
        mask = (wc["home_team"] == fd["home"]) & (wc["away_team"] == fd["away"])
        date_val = ""
        if mask.any():
            row = wc[mask].iloc[0]
            if "date" in wc.columns:
                date_val = str(row["date"])
        result.append({
            "id":     f"group_{fd['group']}_{idx}",
            "home":   fd["home"],
            "away":   fd["away"],
            "group":  fd["group"],
            "date":   date_val,
            "venue":  f"{fd.get('city', '')}, {fd.get('country', '')}",
            "stage":  "group_stage",
            "played": False,
        })
    
    # Add TBD placeholders for knockout stages pre-game
    for stage_name, dates in KO_SCHEDULE.items():
        for i, d in enumerate(dates):
            result.append({
                "id": f"{stage_name}_tbd_{i}",
                "home": "TBD",
                "away": "TBD",
                "group": None,
                "date": d,
                "venue": "Neutral Venue",
                "stage": stage_name,
                "played": False,
            })

    return {"fixtures": result}
 


class BatchMatchItem(BaseModel):
    home:  str
    away:  str
    venue: Optional[str] = ""


class BatchSimRequest(BaseModel):
    matches: List[BatchMatchItem]
    n_sims:  int = 5000


@app.post("/api/simulate_batch")
def simulate_batch(req: BatchSimRequest):
    """
    Run N Monte Carlo simulations for each match in the batch.
    Returns per-match aggregated stats: win%, avg goals, top score distribution.
    """
    if "om" not in app_state:
        raise HTTPException(status_code=503, detail="API not ready.")

    n_sims   = int(np.clip(req.n_sims, 100, 20000))
    rng      = np.random.default_rng(int(time.time() * 1000) % (2 ** 31))
    ko_lookup = app_state["ko_lookup"]
    results  = []

    for match in req.matches:
        home  = match.home
        away  = match.away
        venue = match.venue or ""
        if not home or not away or home == away:
            continue

        # ── Probability data ──────────────────────────────────────────────────
        fd = ko_lookup.get((home, away))
        if not fd:
            try:
                row_dict = feature_engineering.build_match_row(
                    home, away, "2026-06-11", True, "FIFA World Cup",
                    app_state["fe_elo_lookup"], app_state["fe_form_df"],
                    app_state["fe_h2h"], app_state["fe_static"])
                row_features = row_dict_to_features(
                    row_dict, app_state["feature_cols"], app_state["wc_medians"])
                row_np = np.array([row_features], dtype=np.float32)
                if venue:
                    row_np[0] = predict_wc.apply_altitude_to_row(
                        row_np[0], app_state["feature_cols"],
                        venue, home, away, app_state["elo_map"])
                probs = app_state["om"].predict_proba(row_np)[0]
                exp_h = float(np.clip(app_state["gh_model"].predict(row_np)[0], 0.3, 8))
                exp_a = float(np.clip(app_state["ga_model"].predict(row_np)[0], 0.3, 8))
                fd = {"p_H": probs[2], "p_D": probs[1], "p_A": probs[0],
                      "exp_h": exp_h, "exp_a": exp_a}
            except Exception:
                fd = {"p_H": 0.40, "p_D": 0.25, "p_A": 0.35, "exp_h": 1.3, "exp_a": 1.1}

        # ── Monte Carlo loop ──────────────────────────────────────────────────
        hw = aw = dr = gh_sum = ga_sum = 0
        score_counts: dict = {}
        for _ in range(n_sims):
            gh, ga = predict_wc.sample_match(fd, rng)
            gh_sum += gh; ga_sum += ga
            k = f"{gh}-{ga}"
            score_counts[k] = score_counts.get(k, 0) + 1
            if gh > ga:   hw += 1
            elif ga > gh: aw += 1
            else:         dr += 1

        top = sorted(
            [{"score": k, "pct": round(v / n_sims, 4)} for k, v in score_counts.items()],
            key=lambda x: -x["pct"]
        )[:8]

        results.append({
            "home":             home,
            "away":             away,
            "win_pct_home":     round(hw      / n_sims, 4),
            "draw_pct":         round(dr      / n_sims, 4),
            "win_pct_away":     round(aw      / n_sims, 4),
            "avg_goals_home":   round(gh_sum  / n_sims, 2),
            "avg_goals_away":   round(ga_sum  / n_sims, 2),
            "most_common_score": top[0]["score"] if top else "1-1",
            "top_scores":       top,
            "predicted_winner": (home if hw > aw else (away if aw > hw else "Draw")),
            "n_sims":           n_sims,
        })

    return {"results": results}

