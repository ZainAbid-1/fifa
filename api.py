import time
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

import predict_wc
import feature_engineering
from pathlib import Path

# Global state to hold loaded models and data
app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load all models and data from predict_wc.py
    print("Loading models and data for API...")
    om, gh_model, ga_model, feature_cols, wc, teams_df, ea_df = predict_wc.load_all()
    elo_map = dict(zip(teams_df["team"], teams_df["elo_rating"]))
    
    # Pre-compute fixture probabilities
    print("Pre-computing fixture probabilities...")
    fixture_data, ko_lookup, elo_map = predict_wc.precompute_group_probs(
        wc, teams_df, om, gh_model, ga_model, feature_cols, elo_map)

    app_state["om"] = om
    app_state["gh_model"] = gh_model
    app_state["ga_model"] = ga_model
    app_state["feature_cols"] = feature_cols
    app_state["wc"] = wc
    app_state["teams_df"] = teams_df
    app_state["ea_df"] = ea_df
    app_state["elo_map"] = elo_map
    app_state["fixture_data"] = fixture_data
    app_state["ko_lookup"] = ko_lookup
    
    # Load feature engineering static data if needed for what-if
    print("Loading base features for what-if simulator...")
    results, teams, elo_ts, ea, squad = feature_engineering.load_data()
    app_state["fe_results"] = results
    app_state["fe_elo_lookup"] = feature_engineering.build_elo_lookup(elo_ts)
    app_state["fe_form_df"] = feature_engineering.compute_rolling_form(results)
    app_state["fe_h2h"] = feature_engineering.compute_h2h(results)
    app_state["fe_static"] = feature_engineering.build_static_features(teams, ea, squad)
    
    print("API Ready.")
    yield
    # Clean up if needed
    app_state.clear()

app = FastAPI(title="World Cup 2026 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "World Cup API is running."}

@app.get("/api/simulate_tournament")
def simulate_tournament():
    """
    Returns the tournament simulation results (Win%). 
    Reads from the pre-generated CSV for instant response, 
    but this could be wired to run live sims.
    """
    results_path = Path("output/simulation_results.csv")
    if not results_path.exists():
        # Fallback if not run yet
        return {"error": "Simulation results not found. Run predict_wc.py first."}
    
    df = pd.read_csv(results_path)
    
    # Convert to list of dicts for the frontend
    data = df.to_dict(orient="records")
    return {"results": data}

class PredictMatchRequest(BaseModel):
    team_a: str
    team_b: str
    venue: Optional[str] = ""

@app.post("/api/predict_match")
def predict_match(req: PredictMatchRequest):
    """
    Endpoint for the 'Chaos Engine' and 'Match Lab'.
    Returns prediction for a specific match, including context.
    """
    ko_lookup = app_state["ko_lookup"]
    elo_map = app_state["elo_map"]
    ea_df = app_state["ea_df"]
    teams_df = app_state["teams_df"]
    
    # Check if we have pre-computed stats for this matchup
    # We might need to generate on the fly if it's not a pre-computed group match
    # or if we are applying custom venues.
    
    # For now, let's use the make_ko_features logic to get the base prediction
    try:
        fd = predict_wc.make_ko_features(
            req.team_a, req.team_b, elo_map, 
            app_state["om"], app_state["gh_model"], app_state["ga_model"],
            app_state["feature_cols"], ko_lookup, app_state["wc"], teams_df, 
            form_tracker=None
        )
        
        # Calculate chaos potential (upset potential)
        # Higher Elo diff but decent upset probability = chaos
        elo_a = elo_map.get(req.team_a, 1500)
        elo_b = elo_map.get(req.team_b, 1500)
        elo_diff = abs(elo_a - elo_b)
        
        # Win prob of the underdog
        underdog_prob = fd["p_A"] if elo_a > elo_b else fd["p_H"]
        chaos_score = (elo_diff / 400.0) * underdog_prob * 100 # Arbitrary formula for chaos
        is_trap_game = chaos_score > 15 and underdog_prob > 0.25
        
        # Calculate context panel (altitude)
        altitude_penalty = predict_wc.altitude_elo_penalty(req.venue)
        context = {
            "venue": req.venue,
            "altitude_penalty": altitude_penalty,
            "impact_message": f"-{altitude_penalty*1.5:.1f} Elo penalty for visiting team" if altitude_penalty > 0 else "No altitude impact."
        }
        
        # Calculate Nerve Meter (Penalties)
        penalty_prob_a = predict_wc.penalty_win_prob(req.team_a, req.team_b, ea_df)
        
        return {
            "team_a": req.team_a,
            "team_b": req.team_b,
            "win_prob_a": fd["p_H"],
            "draw_prob": fd["p_D"],
            "win_prob_b": fd["p_A"],
            "chaos_potential": {
                "is_trap_game": is_trap_game,
                "score": round(chaos_score, 2)
            },
            "context": context,
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
    adjustments: Dict[str, Dict[str, float]] # e.g. {"France": {"ea_attack": -10}}

@app.post("/api/what_if_predict")
def what_if_predict(req: WhatIfRequest):
    """
    Endpoint for the 'Injury Simulator'.
    Dynamically recalculates a match prediction by modifying static features on the fly.
    """
    # 1. Get the base feature row for this matchup from wc2026_features
    # This requires running the build_match_row logic with modified static features
    # Let's clone the static features and apply the adjustments
    fe_static_copy = app_state["fe_static"].copy(deep=True)
    
    for team, mods in req.adjustments.items():
        for stat, change in mods.items():
            if stat in fe_static_copy.columns:
                # Apply the change (e.g. subtracting from attack)
                mask = fe_static_copy["team"] == team
                if mask.any():
                    fe_static_copy.loc[mask, stat] += change
                    
                    # Update dependent stats if applicable
                    if stat in ["ea_attack", "ea_defense", "ea_midfield"]:
                        # Recalculate ratios and balance
                        row = fe_static_copy.loc[mask]
                        fe_static_copy.loc[mask, "ea_atk_def_ratio"] = row["ea_attack"] / row["ea_defense"].replace(0, np.nan)
                        fe_static_copy.loc[mask, "ea_balance"] = row[["ea_attack", "ea_midfield", "ea_defense"]].std(axis=1)

    # 2. Build the new match row dynamically
    # For a future WC match, the date can be mocked or fetched from the wc df
    match_mask = (app_state["wc"]["home_team"] == req.team_a) & (app_state["wc"]["away_team"] == req.team_b)
    if not match_mask.any():
        match_mask = (app_state["wc"]["home_team"] == req.team_b) & (app_state["wc"]["away_team"] == req.team_a)
        
    date = app_state["wc"][match_mask].iloc[0]["date"] if match_mask.any() else "2026-06-11"
    tournament = app_state["wc"][match_mask].iloc[0]["tournament"] if match_mask.any() else "FIFA World Cup"
    neutral = app_state["wc"][match_mask].iloc[0]["neutral"] if match_mask.any() else True
    
    row_dict = feature_engineering.build_match_row(
        req.team_a, req.team_b, date,
        neutral, tournament,
        app_state["fe_elo_lookup"],
        app_state["fe_form_df"],
        app_state["fe_h2h"],
        fe_static_copy
    )
    
    # Extract only the needed features in the correct order
    row_features = []
    for col in app_state["feature_cols"]:
        val = row_dict.get(col, 0)
        row_features.append(val if not pd.isna(val) else 0)
        
    row_np = np.array([row_features], dtype=np.float32)
    
    # Apply venue altitude if any
    elo_map_copy = app_state["elo_map"].copy()
    if req.venue:
        row_np[0] = predict_wc.apply_altitude_to_row(
            row_np[0], app_state["feature_cols"], 
            req.venue, req.team_a, req.team_b, elo_map_copy
        )
        
    # 3. Predict with the loaded model
    om = app_state["om"]
    probs = om.predict_proba(row_np)[0]
    
    return {
        "team_a": req.team_a,
        "team_b": req.team_b,
        "win_prob_a": float(probs[2]),
        "draw_prob": float(probs[1]),
        "win_prob_b": float(probs[0])
    }

@app.get("/api/leaderboard")
def leaderboard():
    """
    Sleeper leaderboard: compares AI rank vs FIFA rank.
    """
    df = pd.read_csv("output/simulation_results.csv")
    
    # Only consider teams with valid FIFA ranks
    valid_ranks = df.dropna(subset=["world_ranking"]).copy()
    
    # Calculate difference
    valid_ranks["ai_rank"] = valid_ranks["rank"]
    valid_ranks["value_diff"] = valid_ranks["world_ranking"] - valid_ranks["ai_rank"]
    
    # Sort by the biggest positive difference (underrated by FIFA, high in AI model)
    sleepers = valid_ranks.sort_values("value_diff", ascending=False).head(10)
    
    data = sleepers[["team", "ai_rank", "world_ranking", "value_diff", "p_winner"]].to_dict(orient="records")
    return {"sleepers": data}
