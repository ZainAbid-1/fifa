"""
compute_team_ratings.py
=======================
Reads WC2026_Squads_EAFC26_Ratings.csv (player-level data for all 48 WC2026 squads)
and aggregates it into a team-level ratings CSV that matches the schema expected by
feature_engineering.py:

    team, overall, attack, midfield, defense, source, ea_fc26_licensed

Aggregation method:
  - Within each position group (GK, DEF, MID, FWD) compute an EXPONENTIALLY-WEIGHTED
    mean where higher-rated players get more weight.
    weight_i = exp(alpha * (rating_i - min_rating_in_group))
    alpha = 0.15 — tuned so the best player in a group is ~2.5x the weight of the worst.

  - overall = exp-weighted mean of ALL players' Overall ratings
  - attack  = exp-weighted mean of FWD players' Overall ratings
  - midfield = exp-weighted mean of MID players' Overall ratings
  - defense = 0.8 * (exp-weighted mean of DEF Overall) + 0.2 * (exp-weighted mean of GK Overall)
    (GKs contribute 20% to the defense rating, defenders 80%)

Run:
    python data/compute_team_ratings.py

Outputs:
    data/squad_team_ratings.csv
"""

import pandas as pd
import numpy as np
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR   = Path(__file__).parent
INPUT_CSV  = DATA_DIR / "WC2026_Squads_EAFC26_Ratings.csv"
OUTPUT_CSV = DATA_DIR / "squad_team_ratings.csv"

# Exponential weighting sharpness — higher = more weight to elite players
ALPHA = 0.15


def exp_weighted_mean(ratings: pd.Series) -> float:
    """
    Exponentially-weighted mean where higher ratings carry more weight.
    weight_i = exp(alpha * (r_i - r_min))
    """
    if ratings.empty:
        return np.nan
    r = ratings.values.astype(float)
    w = np.exp(ALPHA * (r - r.min()))
    return float(np.dot(w, r) / w.sum())


def compute_team_ratings(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute aggregated team ratings from player-level data.

    Parameters
    ----------
    df : DataFrame with columns [Team, Player, Position, Overall, ...]

    Returns
    -------
    DataFrame with columns [team, overall, attack, midfield, defense, source, ea_fc26_licensed]
    """
    rows = []
    for team, group in df.groupby("Team"):
        gk_ratings  = group[group["Position"] == "GK"]["Overall"]
        def_ratings  = group[group["Position"] == "DEF"]["Overall"]
        mid_ratings  = group[group["Position"] == "MID"]["Overall"]
        fwd_ratings  = group[group["Position"] == "FWD"]["Overall"]
        all_ratings  = group["Overall"]

        overall  = exp_weighted_mean(all_ratings)
        attack   = exp_weighted_mean(fwd_ratings) if not fwd_ratings.empty else overall
        midfield = exp_weighted_mean(mid_ratings) if not mid_ratings.empty else overall

        def_part = exp_weighted_mean(def_ratings) if not def_ratings.empty else overall
        gk_part  = exp_weighted_mean(gk_ratings)  if not gk_ratings.empty  else overall
        defense  = 0.8 * def_part + 0.2 * gk_part

        # Determine source: if all players are Official, mark as official;
        # if any are Estimated, mark as mixed
        sources = group["Rating_Source"].unique() if "Rating_Source" in group.columns else ["Unknown"]
        if len(sources) == 1 and sources[0] == "Official":
            source = "official"
            licensed = "yes"
        elif "Official" in sources:
            source = "mixed"
            licensed = "partial"
        else:
            source = "estimated"
            licensed = "no"

        rows.append({
            "team":            team,
            "overall":         round(overall,  2),
            "attack":          round(attack,   2),
            "midfield":        round(midfield, 2),
            "defense":         round(defense,  2),
            "source":          source,
            "ea_fc26_licensed": licensed,
        })

    result = pd.DataFrame(rows).sort_values("overall", ascending=False).reset_index(drop=True)
    return result


def main():
    print(f"Reading {INPUT_CSV} ...")
    df = pd.read_csv(INPUT_CSV)
    print(f"  {len(df)} player rows, {df['Team'].nunique()} teams")

    # Validate expected columns
    required = {"Team", "Player", "Position", "Overall"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in input CSV: {missing}")

    # Standardise position labels (uppercase, strip)
    df["Position"] = df["Position"].str.strip().str.upper()

    result = compute_team_ratings(df)

    result.to_csv(OUTPUT_CSV, index=False)
    print(f"\nWrote {OUTPUT_CSV}  ({len(result)} teams)")
    print("\nTop 10 teams by overall rating:")
    print(result[["team", "overall", "attack", "midfield", "defense", "source"]].head(10).to_string(index=False))
    print("\nBottom 5 teams:")
    print(result[["team", "overall", "attack", "midfield", "defense"]].tail(5).to_string(index=False))
    print("\nDone!")


if __name__ == "__main__":
    main()
