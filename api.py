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
import threading
import queue
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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


# ── Global simulation state ────────────────────────────────────────────────────

sim_state = {
    "running":   False,
    "progress":  0,
    "total":     0,
    "results":   [],      # list of {team, win_pct, final_pct, sf_pct, qf_pct}
    "stop_flag": False,
    "queue":     queue.Queue(),
}


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


@app.get("/api/simulate_tournament")
def simulate_tournament():
    results_path = Path("output/simulation_results.csv")
    if not results_path.exists():
        return {"error": "Simulation results not found. Run predict_wc.py first."}
    df = pd.read_csv(results_path)
    data = df.to_dict(orient="records")
    return {"results": data}


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
        fd = predict_wc.make_ko_features(
            req.team_a, req.team_b, elo_map,
            app_state["om"], app_state["gh_model"], app_state["ga_model"],
            app_state["feature_cols"], ko_lookup, app_state["wc"], teams_df,
            form_tracker=None
        )
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
            "win_prob_a":   fd["p_H"],
            "draw_prob":    fd["p_D"],
            "win_prob_b":   fd["p_A"],
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

    # Load base sim results if available for win%
    win_pcts = {}
    results_path = Path("output/simulation_results.csv")
    if results_path.exists():
        sim_df = pd.read_csv(results_path)
        for _, row in sim_df.iterrows():
            win_pcts[row["team"]] = {
                "win_pct":   row.get("p_winner", 0),
                "final_pct": row.get("p_final",  0),
                "sf_pct":    row.get("p_sf",     0),
                "qf_pct":    row.get("p_qf",     0),
                "r32_pct":   row.get("p_r32",    0),
            }

    teams_out = []
    for team, players in squad_state.items():
        rating = computed_ratings.get(team, {"overall":70,"attack":70,"midfield":70,"defense":70})
        teams_out.append({
            "team":          team,
            "confederation": get_confederation(team),
            "rating":        rating,
            "sim_results":   win_pcts.get(team, {"win_pct":0,"final_pct":0,"sf_pct":0,"qf_pct":0,"r32_pct":0}),
            "players":       players,
        })

    # Sort by win_pct descending
    teams_out.sort(key=lambda x: x["sim_results"]["win_pct"], reverse=True)
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
# BACKGROUND SIMULATION + SSE
# =============================================================================

class RunSimRequest(BaseModel):
    sims: int = 5000
    seed: int = 42


@app.post("/api/run_simulation")
def run_simulation(req: RunSimRequest):
    """
    Launch a background Monte Carlo simulation using the CURRENT squad state
    (respecting any injuries already set).  Results stream via /api/simulation_stream.
    """
    if sim_state["running"]:
        return {"status": "already_running", "progress": sim_state["progress"],
                "total": sim_state["total"]}

    # Build a live ea_df from current computed ratings
    live_ea_df = ratings_to_df(app_state["computed_ratings"])

    # Snapshot everything needed (so mid-run changes don't corrupt the sim)
    snapshot = {
        "fixture_data": app_state["fixture_data"],
        "ko_lookup":    app_state["ko_lookup"],
        "elo_map":      dict(app_state["elo_map"]),
        "teams_df":     app_state["teams_df"],
        "om":           app_state["om"],
        "gh_model":     app_state["gh_model"],
        "ga_model":     app_state["ga_model"],
        "feature_cols": app_state["feature_cols"],
        "wc":           app_state["wc"],
        "ea_df":        live_ea_df,
        "n_sims":       req.sims,
        "seed":         req.seed,
    }

    # Reset sim state
    sim_state["running"]   = True
    sim_state["stop_flag"] = False
    sim_state["progress"]  = 0
    sim_state["total"]     = req.sims
    sim_state["results"]   = []
    # Drain old queue
    while not sim_state["queue"].empty():
        try: sim_state["queue"].get_nowait()
        except: pass

    t = threading.Thread(target=_run_simulation_thread, args=(snapshot,), daemon=True)
    t.start()

    return {"status": "started", "sims": req.sims}


def _run_simulation_thread(snapshot: dict):
    """Background thread: run Monte Carlo sims and push updates to queue."""
    n_sims       = snapshot["n_sims"]
    master_rng   = np.random.default_rng(snapshot["seed"])
    seeds        = master_rng.integers(0, 2**31, size=n_sims)
    all_teams    = snapshot["teams_df"]["team"].tolist()
    counts       = {t: defaultdict(int) for t in all_teams}
    STAGE_ORDER  = ["group","r32","r16","qf","sf","final","winner"]
    BATCH        = max(50, n_sims // 100)   # send update every ~1%

    try:
        for i, s in enumerate(seeds):
            if sim_state["stop_flag"]:
                break

            rng = np.random.default_rng(int(s))
            res = predict_wc.simulate_one(
                snapshot["fixture_data"], snapshot["ko_lookup"], snapshot["elo_map"],
                snapshot["teams_df"], snapshot["om"], snapshot["gh_model"],
                snapshot["ga_model"], snapshot["feature_cols"],
                snapshot["wc"], rng, ea_df=snapshot["ea_df"]
            )
            for team, stage in res.items():
                counts[team][stage] += 1

            sim_state["progress"] = i + 1

            # Push batch update to SSE queue
            if (i + 1) % BATCH == 0 or i == n_sims - 1:
                done = i + 1
                results = []
                for team in all_teams:
                    sc = counts[team]
                    cumulative = 0
                    probs = {}
                    for stage in reversed(STAGE_ORDER):
                        cumulative += sc.get(stage, 0)
                        probs[f"p_{stage}"] = round(cumulative / done * 100, 2)
                    results.append({"team": team, **probs})
                results.sort(key=lambda x: x["p_winner"], reverse=True)

                sim_state["results"] = results
                sim_state["queue"].put({
                    "progress": done,
                    "total":    n_sims,
                    "pct":      round(done / n_sims * 100, 1),
                    "results":  results,
                })
    finally:
        sim_state["running"]   = False
        sim_state["stop_flag"] = False
        # Final sentinel
        sim_state["queue"].put({"done": True, "progress": sim_state["progress"],
                                "total": n_sims})


@app.get("/api/simulation_stream")
async def simulation_stream():
    """
    Server-Sent Events stream.  Subscribe after calling /api/run_simulation.
    Each event is JSON: {progress, total, pct, results:[{team, p_winner, ...}]}
    Final event has {done: true}.
    """
    def generate():
        yield "retry: 1000\n\n"   # client reconnect interval
        while True:
            try:
                msg = sim_state["queue"].get(timeout=30)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get("done"):
                    break
            except queue.Empty:
                # heartbeat so the connection doesn't time out
                yield ": heartbeat\n\n"

    return StreamingResponse(generate(),
                             media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.post("/api/stop_simulation")
def stop_simulation():
    """Signal the background simulation to stop after the current batch."""
    if not sim_state["running"]:
        return {"status": "not_running"}
    sim_state["stop_flag"] = True
    return {"status": "stopping", "progress": sim_state["progress"]}


@app.get("/api/simulation_status")
def simulation_status():
    """Poll-based alternative to SSE."""
    return {
        "running":  sim_state["running"],
        "progress": sim_state["progress"],
        "total":    sim_state["total"],
        "pct":      round(sim_state["progress"] / max(sim_state["total"], 1) * 100, 1),
        "results":  sim_state["results"],
    }
