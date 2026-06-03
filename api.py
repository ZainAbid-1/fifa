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
    om, gh_model, ga_model, feature_cols, wc, teams_df, ea_df = predict_wc.load_all()
    elo_map = dict(zip(teams_df["team"], teams_df["elo_rating"]))

    print("Pre-computing fixture probabilities...")
    fixture_data, ko_lookup, elo_map = predict_wc.precompute_group_probs(
        wc, teams_df, om, gh_model, ga_model, feature_cols, elo_map)

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# EXISTING ENDPOINTS (preserved)
# =============================================================================

@app.get("/")
def read_root():
    return {"status": "ok", "message": "World Cup 2026 API is running."}


class PredictMatchRequest(BaseModel):
    team_a: str
    team_b: str
    venue: Optional[str] = ""


@app.post("/api/predict_match")
def predict_match(req: PredictMatchRequest):
    ko_lookup = app_state["ko_lookup"]
    elo_map   = app_state["elo_map"]
    ea_df     = app_state["ea_df"]
    teams_df  = app_state["teams_df"]

    try:
        # Check pre-computed first for group matches
        fd = None
        key = (req.team_a, req.team_b)
        if key in ko_lookup:
            fd = ko_lookup[key]

        if not fd:
            # Build full feature row for KO / unknown match
            row_dict = feature_engineering.build_match_row(
                req.team_a, req.team_b, "2026-06-11", True, "FIFA World Cup",
                app_state["fe_elo_lookup"], app_state["fe_form_df"],
                app_state["fe_h2h"], app_state["fe_static"]
            )
            row_features = [row_dict.get(col, 0) if not pd.isna(row_dict.get(col, 0)) else 0
                            for col in app_state["feature_cols"]]
            row_np = np.array([row_features], dtype=np.float32)
            
            # Apply altitude to the full row
            if req.venue:
                row_np[0] = predict_wc.apply_altitude_to_row(
                    row_np[0], app_state["feature_cols"],
                    req.venue, req.team_a, req.team_b, elo_map)

            probs = app_state["om"].predict_proba(row_np)[0]
            exp_h = float(np.clip(app_state["gh_model"].predict(row_np)[0], 0.3, 8))
            exp_a = float(np.clip(app_state["ga_model"].predict(row_np)[0], 0.3, 8))
            fd = {"p_H": probs[2], "p_D": probs[1], "p_A": probs[0], "exp_h": exp_h, "exp_a": exp_a}

        elo_a = elo_map.get(req.team_a, 1500)
        elo_b = elo_map.get(req.team_b, 1500)
        elo_diff = abs(elo_a - elo_b)
        underdog_prob = fd["p_A"] if elo_a > elo_b else fd["p_H"]
        chaos_score = (elo_diff / 400.0) * underdog_prob * 100
        is_trap_game = chaos_score > 15 and underdog_prob > 0.25

        altitude_penalty = predict_wc.altitude_elo_penalty(req.venue)
        context = {
            "venue": req.venue,
            "altitude_penalty": altitude_penalty,
            "impact_message": (f"-{altitude_penalty*1.5:.1f} Elo penalty for visiting team"
                               if altitude_penalty > 0 else "No altitude impact.")
        }
        penalty_prob_a = predict_wc.penalty_win_prob(req.team_a, req.team_b, ea_df)

        return {
            "team_a":       req.team_a,
            "team_b":       req.team_b,
            "win_prob_a":   float(fd["p_H"]),
            "draw_prob":    float(fd["p_D"]),
            "win_prob_b":   float(fd["p_A"]),
            "chaos_potential": {"is_trap_game": is_trap_game, "score": round(chaos_score, 2)},
            "context":      context,
            "penalty_metrics": {
                "clutch_factor_a": penalty_prob_a,
                "clutch_factor_b": 1.0 - penalty_prob_a
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class WhatIfRequest(BaseModel):
    team_a: str
    team_b: str
    venue: Optional[str] = ""
    adjustments: Dict[str, Dict[str, float]]


@app.post("/api/what_if_predict")
def what_if_predict(req: WhatIfRequest):
    fe_static_copy = app_state["fe_static"].copy(deep=True)
    for team, mods in req.adjustments.items():
        for stat, change in mods.items():
            if stat in fe_static_copy.columns:
                mask = fe_static_copy["team"] == team
                if mask.any():
                    fe_static_copy.loc[mask, stat] += change
                    if stat in ["ea_attack", "ea_defense", "ea_midfield"]:
                        row = fe_static_copy.loc[mask]
                        fe_static_copy.loc[mask, "ea_atk_def_ratio"] = (
                            row["ea_attack"] / row["ea_defense"].replace(0, np.nan))
                        fe_static_copy.loc[mask, "ea_balance"] = (
                            row[["ea_attack", "ea_midfield", "ea_defense"]].std(axis=1))

    match_mask = ((app_state["wc"]["home_team"] == req.team_a) &
                  (app_state["wc"]["away_team"] == req.team_b))
    if not match_mask.any():
        match_mask = ((app_state["wc"]["home_team"] == req.team_b) &
                      (app_state["wc"]["away_team"] == req.team_a))

    date       = app_state["wc"][match_mask].iloc[0]["date"]       if match_mask.any() else "2026-06-11"
    tournament = app_state["wc"][match_mask].iloc[0]["tournament"] if match_mask.any() else "FIFA World Cup"
    neutral    = app_state["wc"][match_mask].iloc[0]["neutral"]    if match_mask.any() else True

    row_dict = feature_engineering.build_match_row(
        req.team_a, req.team_b, date, neutral, tournament,
        app_state["fe_elo_lookup"], app_state["fe_form_df"],
        app_state["fe_h2h"], fe_static_copy
    )
    row_features = [row_dict.get(col, 0) if not pd.isna(row_dict.get(col, 0)) else 0
                    for col in app_state["feature_cols"]]
    row_np = np.array([row_features], dtype=np.float32)

    elo_map_copy = app_state["elo_map"].copy()
    if req.venue:
        row_np[0] = predict_wc.apply_altitude_to_row(
            row_np[0], app_state["feature_cols"],
            req.venue, req.team_a, req.team_b, elo_map_copy)

    probs = app_state["om"].predict_proba(row_np)[0]
    return {
        "team_a": req.team_a, "team_b": req.team_b,
        "win_prob_a": float(probs[2]),
        "draw_prob":  float(probs[1]),
        "win_prob_b": float(probs[0])
    }


@app.get("/api/leaderboard")
def leaderboard():
    df = pd.read_csv("output/simulation_results.csv")
    valid_ranks = df.dropna(subset=["world_ranking"]).copy()
    valid_ranks["ai_rank"]    = valid_ranks["rank"]
    valid_ranks["value_diff"] = valid_ranks["world_ranking"] - valid_ranks["ai_rank"]
    sleepers = valid_ranks.sort_values("value_diff", ascending=False).head(10)
    data = sleepers[["team", "ai_rank", "world_ranking", "value_diff", "p_winner"]].to_dict(orient="records")
    return {"sleepers": data}


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
    "stage": "not_started", # "not_started", "group_stage", "r32", "r16", "qf", "sf", "final", "finished"
    "fixtures": {},         # stage_name -> list of matches
    "standings": {},        # group_name -> list of team standing dicts
    "third_place_standings": [],
    "r32_winners": [],
    "r16_winners": [],
    "qf_winners": [],
    "sf_winners": [],
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

    row_features = [row_dict.get(col, 0) if not pd.isna(row_dict.get(col, 0)) else 0
                    for col in app_state["feature_cols"]]
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
    group_fixtures = []
    for idx, fd in enumerate(fixture_data):
        group_fixtures.append({
            "id": f"group_{fd['group']}_{idx}",
            "home": fd["home"],
            "away": fd["away"],
            "group": fd["group"],
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
        
    single_tournament.update({
        "stage": "group_stage",
        "fixtures": {
            "group_stage": group_fixtures,
            "r32": [],
            "r16": [],
            "qf": [],
            "sf": [],
            "final": []
        },
        "standings": standings,
        "third_place_standings": [],
        "r32_winners": [],
        "r16_winners": [],
        "qf_winners": [],
        "sf_winners": [],
        "champion": None
    })
    
    return {"status": "started", "stage": "group_stage", "seed": selected_seed}


@app.get("/api/tournament/state")
def get_tournament_state():
    """Get the current state of the step-by-step single tournament simulation."""
    return single_tournament


@app.post("/api/tournament/simulate_stage")
def simulate_stage():
    """Simulate matches for the current stage and progress the tournament to the next stage."""
    stage = single_tournament["stage"]
    if stage == "not_started":
        raise HTTPException(status_code=400, detail="Tournament not started. Call /api/tournament/start first.")
    if stage == "finished":
        return {"status": "finished", "message": "Tournament is already finished.", "champion": single_tournament["champion"]}
        
    if "teams_df" not in app_state or "fixture_data" not in app_state:
        raise HTTPException(status_code=503, detail="API models/data not fully loaded yet.")

    rng = np.random.default_rng(single_tournament["seed"])
    live_ea_df = ratings_to_df(app_state["computed_ratings"])
    
    if stage == "group_stage":
        # Simulate all 72 Group Matches
        fixtures = single_tournament["fixtures"]["group_stage"]
        fixture_data = app_state["fixture_data"]
        
        # Build mapping for quick probability lookup
        fd_map = {(fd["home"], fd["away"]): fd for fd in fixture_data}
        
        # Reset standings tracker
        pts = defaultdict(int)
        gf = defaultdict(int)
        gd = defaultdict(int)
        won = defaultdict(int)
        drawn = defaultdict(int)
        lost = defaultdict(int)
        played = defaultdict(int)
        
        for m in fixtures:
            # Look up fixture data
            key = (m["home"], m["away"])
            fd = fd_map.get(key)
            if not fd:
                # Reverse lookup
                fd = fd_map.get((m["away"], m["home"]))
                if fd:
                    fd = {
                        "p_H": fd["p_A"], "p_D": fd["p_D"], "p_A": fd["p_H"],
                        "exp_h": fd["exp_a"], "exp_a": fd["exp_h"]
                    }
                    
            if not fd:
                # Fallback if not found (shouldn't happen)
                fd = {"p_H": 0.45, "p_D": 0.25, "p_A": 0.30, "exp_h": 1.5, "exp_a": 1.2}
                
            gh, ga = predict_wc.sample_match(fd, rng)
            m["home_goals"] = int(gh)
            m["away_goals"] = int(ga)
            m["played"] = True
            
            played[m["home"]] += 1
            played[m["away"]] += 1
            gf[m["home"]] += gh
            gf[m["away"]] += ga
            gd[m["home"]] += (gh - ga)
            gd[m["away"]] += (ga - gh)
            
            if gh > ga:
                m["winner"] = m["home"]
                m["win_reason"] = "90m"
                pts[m["home"]] += 3
                won[m["home"]] += 1
                lost[m["away"]] += 1
            elif ga > gh:
                m["winner"] = m["away"]
                m["win_reason"] = "90m"
                pts[m["away"]] += 3
                won[m["away"]] += 1
                lost[m["home"]] += 1
            else:
                m["winner"] = None
                m["win_reason"] = "90m"
                pts[m["home"]] += 1
                pts[m["away"]] += 1
                drawn[m["home"]] += 1
                drawn[m["away"]] += 1
                
        # Re-compute and sort standings for each group
        teams_df = app_state["teams_df"]
        group_standings = {}
        
        for group in GROUPS:
            g_teams = teams_df[teams_df["group"] == group]["team"].tolist()
            
            # Populate stats
            group_stats = []
            for t in g_teams:
                group_stats.append({
                    "team": t,
                    "played": int(played[t]),
                    "won": int(won[t]),
                    "drawn": int(drawn[t]),
                    "lost": int(lost[t]),
                    "gf": int(gf[t]),
                    "ga": int(gf[t] - gd[t]), # ga = gf - gd
                    "gd": int(gd[t]),
                    "pts": int(pts[t])
                })
                
            # Sort by pts desc, gd desc, gf desc (FIFA tiebreakers)
            group_stats.sort(key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)
            single_tournament["standings"][group] = group_stats
            group_standings[group] = [x["team"] for x in group_stats]
            
        # Determine 3rd place advancement
        third_place_list = []
        for group in GROUPS:
            # 3rd team is at index 2
            t = group_standings[group][2]
            third_place_list.append({
                "team": t,
                "group": group,
                "pts": int(pts[t]),
                "gd": int(gd[t]),
                "gf": int(gf[t]),
                "advanced": False
            })
            
        # Sort best 3rd place teams
        third_place_list.sort(key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)
        
        # Top 8 advance
        advancing_3rd = []
        for idx in range(12):
            if idx < 8:
                third_place_list[idx]["advanced"] = True
                advancing_3rd.append(third_place_list[idx]["team"])
                
        single_tournament["third_place_standings"] = third_place_list
        
        # Build Round of 32 pairings
        r32_pairs = []
        for g1, g2 in [("A","B"),("C","D"),("E","F"),("G","H"),("I","J"),("K","L")]:
            r32_pairs.append((group_standings[g1][0], group_standings[g2][1]))
            r32_pairs.append((group_standings[g2][0], group_standings[g1][1]))
        for i in range(0, 8, 2):
            r32_pairs.append((advancing_3rd[i], advancing_3rd[i+1]))
            
        # Populate R32 fixtures
        r32_fixtures = []
        for idx, (h, a) in enumerate(r32_pairs):
            r32_fixtures.append({
                "id": f"r32_{idx}",
                "home": h,
                "away": a,
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
                "pen_away_score": 0
            })
            
        single_tournament["fixtures"]["r32"] = r32_fixtures
        single_tournament["stage"] = "r32"
        
    else:
        # Knockout stage simulation (r32, r16, qf, sf, final)
        fixtures = single_tournament["fixtures"][stage]
        
        # Initialize Form Tracker from Group Stage match results
        form_tracker = predict_wc.FormTracker()
        for m in single_tournament["fixtures"]["group_stage"]:
            form_tracker.update(m["home"], m["away"], m["home_goals"], m["away_goals"])
            
        # Update Form Tracker with previous KO stages results
        ko_stages = ["r32", "r16", "qf", "sf"]
        for s in ko_stages:
            if s in single_tournament["fixtures"] and single_tournament["fixtures"][s]:
                for m in single_tournament["fixtures"][s]:
                    if m.get("played"):
                        form_tracker.update(m["home"], m["away"], m["home_goals"], m["away_goals"])
                        
        winners = []
        for m in fixtures:
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
            winners.append(res["winner"])
            
        if stage == "r32":
            single_tournament["r32_winners"] = winners
            r16_fixtures = []
            for i in range(0, 16, 2):
                r16_fixtures.append({
                    "id": f"r16_{i//2}",
                    "home": winners[i],
                    "away": winners[i+1],
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
                    "pen_away_score": 0
                })
            single_tournament["fixtures"]["r16"] = r16_fixtures
            single_tournament["stage"] = "r16"
            
        elif stage == "r16":
            single_tournament["r16_winners"] = winners
            qf_fixtures = []
            for i in range(0, 8, 2):
                qf_fixtures.append({
                    "id": f"qf_{i//2}",
                    "home": winners[i],
                    "away": winners[i+1],
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
                    "pen_away_score": 0
                })
            single_tournament["fixtures"]["qf"] = qf_fixtures
            single_tournament["stage"] = "qf"
            
        elif stage == "qf":
            single_tournament["qf_winners"] = winners
            sf_fixtures = []
            for i in range(0, 4, 2):
                sf_fixtures.append({
                    "id": f"sf_{i//2}",
                    "home": winners[i],
                    "away": winners[i+1],
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
                    "pen_away_score": 0
                })
            single_tournament["fixtures"]["sf"] = sf_fixtures
            single_tournament["stage"] = "sf"
            
        elif stage == "sf":
            single_tournament["sf_winners"] = winners
            final_fixtures = [{
                "id": "final_0",
                "home": winners[0],
                "away": winners[1],
                "venue": "MetLife Stadium, New York/New Jersey",
                "home_goals": None,
                "away_goals": None,
                "played": False,
                "winner": None,
                "win_reason": None,
                "extra_time": False,
                "penalties": False,
                "pen_winner": None,
                "pen_home_score": 0,
                "pen_away_score": 0
            }]
            single_tournament["fixtures"]["final"] = final_fixtures
            single_tournament["stage"] = "final"
            
        elif stage == "final":
            single_tournament["champion"] = winners[0]
            single_tournament["stage"] = "finished"
            
    # Advance the seed slightly for the next stages
    single_tournament["seed"] = int(single_tournament["seed"] * 31 + 17) % 1000000
    
    return {
        "status": "simulated",
        "stage_completed": stage,
        "next_stage": single_tournament["stage"]
    }
