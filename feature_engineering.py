"""
WC 2026 Match Prediction — Feature Engineering Pipeline
========================================================
Produces two output CSVs:
  - match_features.csv   : one row per historical match (train/val set)
  - wc2026_features.csv  : one row per upcoming WC 2026 fixture

Run:
    python feature_engineering.py

All paths are relative to the script.  Edit DATA_DIR / OUT_DIR if needed.
"""

import pandas as pd
import numpy as np
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
DATA_DIR = Path("data")          # put your CSVs here
OUT_DIR  = Path("output")
OUT_DIR.mkdir(exist_ok=True)

RESULTS_FILE  = DATA_DIR / "results_2018_onwards.csv"
TEAMS_FILE    = DATA_DIR / "teams_2026.csv"
ELO_FILE      = DATA_DIR / "elo_ratings.csv"
EA_FILE       = DATA_DIR / "fifa_team_ratings_updated.csv"
SQUAD_FILE    = DATA_DIR / "squad_values.csv"

# ── Tournament importance weights (mirrors eloratings.net K-factor logic) ──
TOURNAMENT_WEIGHTS = {
    "FIFA World Cup":                    1.0,
    "Copa América":                      0.85,
    "UEFA Euro":                         0.85,
    "African Cup of Nations":            0.85,
    "AFC Asian Cup":                     0.85,
    "CONCACAF Gold Cup":                 0.75,
    "UEFA Nations League":               0.70,
    "CONMEBOL–UEFA Cup of Champions":    0.70,
    "FIFA World Cup qualification":      0.65,
    "UEFA Euro qualification":           0.60,
    "African Cup of Nations qualification": 0.55,
    "Gold Cup":                          0.55,
    "CONCACAF Nations League":           0.55,
    "Friendly":                          0.30,
}

def tournament_weight(t: str) -> float:
    for key, w in TOURNAMENT_WEIGHTS.items():
        if key.lower() in str(t).lower():
            return w
    return 0.45   # default for minor tournaments


# ═════════════════════════════════════════════════════════════════════════════
# 1. LOAD & CLEAN
# ═════════════════════════════════════════════════════════════════════════════

def load_data():
    results = pd.read_csv(RESULTS_FILE, parse_dates=["date"])
    teams   = pd.read_csv(TEAMS_FILE)
    elo_ts  = pd.read_csv(ELO_FILE,     parse_dates=["date"])
    ea      = pd.read_csv(EA_FILE)
    squad   = pd.read_csv(SQUAD_FILE)

    # Keep only 48 WC teams in the elo time-series
    wc_teams = set(teams["team"])
    elo_ts   = elo_ts[elo_ts["team"].isin(wc_teams)].copy()

    # Sort once
    results = results.sort_values("date").reset_index(drop=True)
    elo_ts  = elo_ts.sort_values(["team", "date"]).reset_index(drop=True)

    return results, teams, elo_ts, ea, squad


# ═════════════════════════════════════════════════════════════════════════════
# 2. ELO HELPERS
# ═════════════════════════════════════════════════════════════════════════════

def build_elo_lookup(elo_ts: pd.DataFrame) -> dict:
    """
    Returns {team: (sorted_dates_array, sorted_ratings_array)}
    for fast 'elo as of date X' lookups.
    """
    lookup = {}
    for team, grp in elo_ts.groupby("team"):
        grp = grp.sort_values("date")
        lookup[team] = (grp["date"].values, grp["elo_rating"].values)
    return lookup


def elo_as_of(lookup: dict, team: str, date, fallback: float = 1500.0) -> float:
    """Latest Elo rating for `team` strictly before `date`."""
    if team not in lookup:
        return fallback
    dates, ratings = lookup[team]
    idx = np.searchsorted(dates, np.datetime64(date), side="left") - 1
    if idx < 0:
        return float(ratings[0]) if len(ratings) else fallback
    return float(ratings[idx])


def win_probability(elo_a: float, elo_b: float) -> float:
    """Expected win probability for team A given Elo ratings."""
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / 400.0))


# ═════════════════════════════════════════════════════════════════════════════
# 3. ROLLING FORM FEATURES  (computed per-team, per-match)
# ═════════════════════════════════════════════════════════════════════════════

def compute_rolling_form(results: pd.DataFrame) -> pd.DataFrame:
    """
    For each completed match row, attach rolling stats computed from the
    PREVIOUS N matches of each participating team.

    Windows: last 5, last 10, last 5 weighted by recency & importance.
    """
    played = results.dropna(subset=["home_score", "away_score"]).copy()
    played["t_weight"] = played["tournament"].apply(tournament_weight)
    played["goal_diff"] = played["home_score"] - played["away_score"]

    # Build a flat list of (date, team, goals_for, goals_against, result, t_weight)
    records = []
    for _, r in played.iterrows():
        # home perspective
        records.append  ({
            "date": r["date"], "team": r["home_team"], "opponent": r["away_team"],
            "gf": r["home_score"], "ga": r["away_score"],
            "result": 1 if r["home_score"] > r["away_score"] else
                      (0.5 if r["home_score"] == r["away_score"] else 0),
            "t_weight": r["t_weight"], "neutral": r["neutral"], "is_home": True
        })
        # away perspective
        records.append({
            "date": r["date"], "team": r["away_team"], "opponent": r["home_team"],
            "gf": r["away_score"], "ga": r["home_score"],
            "result": 1 if r["away_score"] > r["home_score"] else
                      (0.5 if r["away_score"] == r["home_score"] else 0),
            "t_weight": r["t_weight"], "neutral": r["neutral"], "is_home": False
        })

    team_hist = (pd.DataFrame(records)
                   .sort_values(["team", "date"])
                   .reset_index(drop=True))

    # Rolling stats per team (shift(1) so we never leak current match)
    def rolling_stats(grp, window):
        shifted = grp.shift(1)  # look back only
        gf   = shifted["gf"].rolling(window, min_periods=1).mean()
        ga   = shifted["ga"].rolling(window, min_periods=1).mean()
        pts  = shifted["result"].rolling(window, min_periods=1).mean()

        # Weighted form (more recent + more important matches count more)
        def weighted_mean(s_result, s_weight):
            def _wm(x):
                idx = x.index
                r = s_result.loc[idx]
                w = s_weight.loc[idx]
                w_sum = w.sum()
                return (r * w).sum() / w_sum if w_sum > 0 else np.nan
            return s_result.rolling(window, min_periods=1).apply(_wm, raw=False)

        w_pts = weighted_mean(shifted["result"], shifted["t_weight"])
        return pd.DataFrame({
            f"gf_{window}":    gf.values,
            f"ga_{window}":    ga.values,
            f"pts_{window}":   pts.values,
            f"wpts_{window}":  w_pts.values,
        }, index=grp.index)

    stats5  = team_hist.groupby("team", group_keys=False).apply(rolling_stats, window=5)
    stats10 = team_hist.groupby("team", group_keys=False).apply(rolling_stats, window=10)

    form = pd.concat([team_hist, stats5, stats10], axis=1)
    return form


# ═════════════════════════════════════════════════════════════════════════════
# 4. H2H FEATURES
# ═════════════════════════════════════════════════════════════════════════════

def compute_h2h(results: pd.DataFrame,
                decay_lambda: float = 0.3,
                max_matches: int = 10) -> dict:
    """
    Returns a nested dict with TIME-DECAYED head-to-head stats.

    Key changes vs original:
      1. Exponential time decay: weight = exp(-λ * years_ago)
         λ=0.3 → half-lixfe ≈ 2.3 years (one full international cycle).
         A match from 1 year ago counts 0.74×; from 5 years ago 0.22×.
      2. Capped at the most recent `max_matches` meetings per pair,
         so ancient history can't overwhelm the signal.
      3. The raw match count is stored alongside the effective (decayed)
         weight sum, so h2h_features() can shrink estimates toward 0.5
         when data is sparse.
    """
    played = results.dropna(subset=["home_score", "away_score"]).copy()
    played = played.sort_values("date").reset_index(drop=True)
    # Reference date: day after the last known match in the dataset
    ref_date = played["date"].max() + pd.Timedelta(days=1)

    def _key(a, b):
        return tuple(sorted([a, b]))

    # Group all meetings between each pair
    pair_records = {}
    for _, r in played.iterrows():
        ht, at = r["home_team"], r["away_team"]
        k = _key(ht, at)
        pair_records.setdefault(k, []).append(r)

    h2h = {}
    for k, records in pair_records.items():
        # Keep only the most recent max_matches meetings
        records = records[-max_matches:]
        d = {
            "w_wins_0": 0.0, "w_wins_1": 0.0, "w_draws": 0.0,
            "w_gf_0": 0.0,   "w_gf_1": 0.0,
            "w_total": 0.0,  "n_matches": len(records)
        }
        for r in records:
            years_ago = (ref_date - r["date"]).days / 365.25
            w = np.exp(-decay_lambda * years_ago)
            ht, at = r["home_team"], r["away_team"]
            flip = (ht != k[0])      # True when home team is k[1]

            d["w_total"] += w
            d["w_gf_0"]  += w * (r["away_score"] if flip else r["home_score"])
            d["w_gf_1"]  += w * (r["home_score"] if flip else r["away_score"])

            if r["home_score"] > r["away_score"]:     # home win
                if not flip: d["w_wins_0"] += w
                else:        d["w_wins_1"] += w
            elif r["home_score"] < r["away_score"]:   # away win
                if flip:     d["w_wins_0"] += w
                else:        d["w_wins_1"] += w
            else:
                d["w_draws"] += w

        h2h[k] = d

    return h2h


def h2h_features(h2h: dict, team_a: str, team_b: str,
                 shrink_prior: float = 0.5,
                 shrink_k: float = 3.0) -> dict:
    """
    Build H2H feature dict from pre-computed (decayed) h2h stats.

    Key changes vs original:
      1. Uses time-decayed weights (w_wins_*, w_total) instead of raw counts.
      2. Bayesian shrinkage: win_rate = (w_wins_a + k*prior) / (w_total + k)
         With k=3.0 a pair with zero meetings gets exactly 0.5 (prior).
         A pair with 1 recent meeting sits at ~0.56/0.44 rather than 1.0/0.0.
         A pair with 10+ meetings converges on the true decayed win rate.
      3. Exposes h2h_n_matches so the model can learn when to trust H2H.
    """
    k = tuple(sorted([team_a, team_b]))
    flip = (k[0] != team_a)

    if k not in h2h:
        return {
            "h2h_wwin_rate_a": shrink_prior,
            "h2h_wwin_rate_b": shrink_prior,
            "h2h_wdraw_rate":  0.0,
            "h2h_gf_a":        0.0,
            "h2h_ga_a":        0.0,
            "h2h_n_matches":   0,
        }

    d = h2h[k]
    wt = d["w_total"]

    # Pick the A/B orientation
    w_wins_a = d["w_wins_1"] if flip else d["w_wins_0"]
    w_wins_b = d["w_wins_0"] if flip else d["w_wins_1"]
    w_gf_a   = d["w_gf_1"]  if flip else d["w_gf_0"]
    w_gf_b   = d["w_gf_0"]  if flip else d["w_gf_1"]

    # Shrinkage: blend decayed rate toward prior (0.5) when wt is small
    denom = wt + shrink_k
    win_rate_a = (w_wins_a + shrink_k * shrink_prior) / denom
    win_rate_b = (w_wins_b + shrink_k * (1 - shrink_prior)) / denom
    draw_rate  = (d["w_draws"] + shrink_k * 0.25) / denom

    # Goals per effective match (avoid division by 0)
    gf_a = w_gf_a / wt if wt > 0 else 0.0
    gf_b = w_gf_b / wt if wt > 0 else 0.0

    return {
        "h2h_wwin_rate_a": win_rate_a,
        "h2h_wwin_rate_b": win_rate_b,
        "h2h_wdraw_rate":  draw_rate,
        "h2h_gf_a":        gf_a,
        "h2h_ga_a":        gf_b,
        "h2h_n_matches":   d["n_matches"],  # raw count — model learns when to trust
    }


# ═════════════════════════════════════════════════════════════════════════════
# 5.  STATIC TEAM FEATURES
# ═════════════════════════════════════════════════════════════════════════════

def build_static_features(teams: pd.DataFrame,
                           ea: pd.DataFrame,
                           squad: pd.DataFrame) -> pd.DataFrame:
    base = teams[["team", "world_ranking", "participations",
                  "elo_rating", "elo_rank_wc"]].copy()

    ea_cols = ea[["team", "overall", "attack", "midfield", "defense"]].copy()
    ea_cols.columns = ["team", "ea_overall", "ea_attack", "ea_midfield", "ea_defense"]

    # Derived EA features
    ea_cols["ea_atk_def_ratio"]   = ea_cols["ea_attack"]  / ea_cols["ea_defense"].replace(0, np.nan)
    ea_cols["ea_balance"]         = ea_cols[["ea_attack", "ea_midfield", "ea_defense"]].std(axis=1)

    sq = squad.rename(columns={"total_market_value_euros_millions": "squad_value_m"})
    sq["log_squad_value"] = np.log1p(sq["squad_value_m"])

    merged = base.merge(ea_cols, on="team", how="left") \
                 .merge(sq[["team", "squad_value_m", "log_squad_value"]], on="team", how="left")

    # Normalised ranking (lower rank = stronger → invert)
    merged["rank_score"] = 1.0 / merged["world_ranking"]

    # WC experience (log-scaled so 1st vs 2nd participation matters more)
    merged["wc_exp"] = np.log1p(merged["participations"])

    return merged


# ═════════════════════════════════════════════════════════════════════════════
# 6.  ASSEMBLE FEATURES FOR ONE MATCH
# ═════════════════════════════════════════════════════════════════════════════

def get_team_form(form_df: pd.DataFrame, team: str, date) -> dict:
    """Latest rolling form for a team BEFORE the given date."""
    sub = form_df[(form_df["team"] == team) & (form_df["date"] < date)]
    if sub.empty:
        return {}
    row = sub.iloc[-1]
    return {
        "gf5": row.get("gf_5", np.nan),   "ga5": row.get("ga_5", np.nan),
        "pts5": row.get("pts_5", np.nan),  "wpts5": row.get("wpts_5", np.nan),
        "gf10": row.get("gf_10", np.nan), "ga10": row.get("ga_10", np.nan),
        "pts10": row.get("pts_10", np.nan),"wpts10": row.get("wpts_10", np.nan),
    }


def build_match_row(home: str, away: str, date,
                    neutral: bool, tournament: str,
                    elo_lookup: dict,
                    form_df: pd.DataFrame,
                    h2h: dict,
                    static: pd.DataFrame) -> dict:

    row = {"date": date, "home_team": home, "away_team": away,
           "neutral": neutral, "tournament": tournament,
           "t_weight": tournament_weight(tournament)}

    # ── Elo features ─────────────────────────────────────────────────────
    elo_h = elo_as_of(elo_lookup, home, date)
    elo_a = elo_as_of(elo_lookup, away, date)
    row["elo_home"]       = elo_h
    row["elo_away"]       = elo_a
    row["elo_diff"]       = elo_h - elo_a
    row["elo_win_prob_h"] = win_probability(elo_h + (0 if neutral else 100), elo_a)
    row["elo_win_prob_a"] = 1.0 - row["elo_win_prob_h"]

    # ── Rolling form ─────────────────────────────────────────────────────
    fh = get_team_form(form_df, home, date)
    fa = get_team_form(form_df, away, date)
    for k, v in fh.items():
        row[f"h_{k}"] = v
    for k, v in fa.items():
        row[f"a_{k}"] = v

    # Differentials (often more predictive than raw values)
    row["diff_pts5"]   = row.get("h_pts5",  0) - row.get("a_pts5",  0)
    row["diff_pts10"]  = row.get("h_pts10", 0) - row.get("a_pts10", 0)
    row["diff_wpts5"]  = row.get("h_wpts5", 0) - row.get("a_wpts5", 0)
    row["diff_gf5"]    = row.get("h_gf5",   0) - row.get("a_gf5",   0)
    row["diff_ga5"]    = row.get("h_ga5",   0) - row.get("a_ga5",   0)

    # ── H2H ─────────────────────────────────────────────────────────────
    h2h_feats = h2h_features(h2h, home, away)
    row.update(h2h_feats)

    # ── Static team features ─────────────────────────────────────────────
    sh = static[static["team"] == home]
    sa = static[static["team"] == away]

    def _add(prefix, df_row):
        for col in ["world_ranking", "participations", "elo_rating", "elo_rank_wc",
                    "ea_overall", "ea_attack", "ea_midfield", "ea_defense",
                    "ea_atk_def_ratio", "ea_balance",
                    "squad_value_m", "log_squad_value",
                    "rank_score", "wc_exp"]:
            row[f"{prefix}_{col}"] = df_row[col].values[0] if len(df_row) else np.nan

    if not sh.empty: _add("h", sh)
    if not sa.empty: _add("a", sa)

    # Differentials for static features
    for col in ["ea_overall", "ea_attack", "ea_midfield", "ea_defense",
                "squad_value_m", "rank_score", "wc_exp"]:
        hv = row.get(f"h_{col}", np.nan)
        av = row.get(f"a_{col}", np.nan)
        row[f"diff_{col}"] = hv - av if (not np.isnan(hv) and not np.isnan(av)) else np.nan

    return row


# ═════════════════════════════════════════════════════════════════════════════
# 7.  TARGETS  (for historical matches only)
# ═════════════════════════════════════════════════════════════════════════════

def add_targets(features_df: pd.DataFrame, results: pd.DataFrame) -> pd.DataFrame:
    played = results.dropna(subset=["home_score", "away_score"]).copy()
    played["outcome"] = np.where(played["home_score"] > played["away_score"], "H",
                        np.where(played["home_score"] < played["away_score"], "A", "D"))
    played["home_goals"] = played["home_score"].astype(int)
    played["away_goals"] = played["away_score"].astype(int)
    played["goal_diff"]  = played["home_goals"] - played["away_goals"]
    played["total_goals"]= played["home_goals"] + played["away_goals"]

    targets = played[["date", "home_team", "away_team",
                       "outcome", "home_goals", "away_goals",
                       "goal_diff", "total_goals"]]

    return features_df.merge(targets, on=["date", "home_team", "away_team"], how="left")


# ═════════════════════════════════════════════════════════════════════════════
# 8.  MAIN PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

def run():
    print("Loading data...")
    results, teams, elo_ts, ea, squad = load_data()

    print("Building Elo lookup...")
    elo_lookup = build_elo_lookup(elo_ts)

    print("Computing rolling form...")
    form_df = compute_rolling_form(results)

    print("Computing H2H stats...")
    h2h = compute_h2h(results)

    print("Building static features...")
    static = build_static_features(teams, ea, squad)

    # ── Historical matches ────────────────────────────────────────────────
    print("Assembling historical match features...")
    played = results.dropna(subset=["home_score", "away_score"])
    hist_rows = []
    for _, r in played.iterrows():
        hist_rows.append(
            build_match_row(r["home_team"], r["away_team"], r["date"],
                            r["neutral"], r["tournament"],
                            elo_lookup, form_df, h2h, static)
        )
    hist_df = pd.DataFrame(hist_rows)
    hist_df = add_targets(hist_df, results)
    hist_df.to_csv(OUT_DIR / "match_features.csv", index=False)
    print(f"  → match_features.csv  ({len(hist_df)} rows × {len(hist_df.columns)} cols)")

    # ── Upcoming WC 2026 fixtures ─────────────────────────────────────────
    print("Assembling WC 2026 fixture features...")
    upcoming = results[results["home_score"].isna()].copy()
    wc_rows = []
    for _, r in upcoming.iterrows():
        wc_rows.append(
            build_match_row(r["home_team"], r["away_team"], r["date"],
                            r["neutral"], r["tournament"],
                            elo_lookup, form_df, h2h, static)
        )
    wc_df = pd.DataFrame(wc_rows)
    wc_df.to_csv(OUT_DIR / "wc2026_features.csv", index=False)
    print(f"  → wc2026_features.csv ({len(wc_df)} rows × {len(wc_df.columns)} cols)")

    # ── Feature summary ────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("FEATURE GROUPS SUMMARY")
    print("="*60)
    groups = {
        "🎯 Elo / Win Probability":
            [c for c in hist_df.columns if "elo" in c.lower()],
        "📈 Rolling Form (5-game)":
            [c for c in hist_df.columns if "_5" in c and c.startswith(("h_","a_","diff_pt","diff_gf","diff_ga"))],
        "📉 Rolling Form (10-game)":
            [c for c in hist_df.columns if "_10" in c],
        "⚔️  Head-to-Head":
            [c for c in hist_df.columns if "h2h" in c],
        "🎮 EA FC 26 Ratings":
            [c for c in hist_df.columns if "ea_" in c],
        "💰 Squad Value":
            [c for c in hist_df.columns if "squad" in c or "log_squad" in c],
        "🏆 Tournament / Context":
            [c for c in hist_df.columns if c in ["t_weight","neutral","wc_exp","participations"]],
        "🌍 World Ranking":
            [c for c in hist_df.columns if "rank" in c or "ranking" in c],
        "🎯 Targets (train only)":
            ["outcome","home_goals","away_goals","goal_diff","total_goals"],
    }
    for group, cols in groups.items():
        existing = [c for c in cols if c in hist_df.columns]
        if existing:
            print(f"\n{group}  ({len(existing)} features)")
            for c in existing:
                print(f"    {c}")

    print(f"\nTotal feature columns: {len(hist_df.columns)}")
    print("Done ✓")


if __name__ == "__main__":
    run()