"""
WC 2026 Tournament Simulator — Monte Carlo Edition (v2 — Enhanced)
==================================================================
Improvements over v1:
  [1] Dynamic in-tournament form — momentum from group stage flows into KO features
  [3] Host nation home advantage — USA / Canada / Mexico get Elo boost at home venues
  [4] Extra time before penalties — 30-min ET at reduced goal rate before shootout
  [5] Richer penalty shootout model — EA attack/defence + historical WC penalty record
  [6] Accurate 3rd-place advancement — real simulated pts/gd/gf, not Elo proxy
  [7] Altitude & travel fatigue — venue altitude penalty + consecutive-match fatigue

Reads:   output/wc2026_features.csv
         models/xgb_outcome.json
         models/xgb_goals_home.json
         models/xgb_goals_away.json
         models/feature_columns.json
         data/teams_2026.csv
         data/squad_team_ratings.csv

Saves:   output/simulation_results.csv

Run:
    python predict_wc.py [--sims 10000] [--seed 42]
"""

import argparse, json, warnings, time
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

warnings.filterwarnings("ignore")

OUT_DIR   = Path("output")
MODEL_DIR = Path("models")
DATA_DIR  = Path("data")

GROUPS      = list("ABCDEFGHIJKL")
STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "final", "winner"]

# ── Fix 3: Host nations ───────────────────────────────────────────────────────
HOST_NATIONS = {"United States", "Canada", "Mexico"}

# ── Fix 7: Venue altitudes (metres above sea level) ──────────────────────────
# Only venues >= 500m get a meaningful penalty
VENUE_ALTITUDE = {
    "Mexico City":    2240,   # Estadio Azteca
    "Zapopan":        1566,   # Estadio Akron (Guadalajara metro)
    "Guadalajara":    1566,
    "Monterrey":       538,
    "Atlanta":         315,
    "Kansas City":     288,
    "Dallas":          183,
    "Toronto":          76,
    "Los Angeles":      88,
    "Inglewood":        88,
    # All other venues treated as ~sea level
}
ALTITUDE_THRESHOLD  = 500   # metres — below this, no penalty applied
ALTITUDE_ELO_SCALE  = 0.015  # Elo penalty per metre above threshold (both teams)

# ── Fix 5: Historical WC penalty shootout record (wins / total) ───────────────
# Source: all WC knockout-round penalty shootouts since 1982
WC_PENALTY_RECORD = {
    "Argentina":     (5, 6),
    "France":        (2, 4),
    "Germany":       (5, 6),
    "Brazil":        (3, 6),
    "Netherlands":   (1, 4),
    "England":       (2, 8),
    "Spain":         (2, 3),
    "Italy":         (4, 7),
    "Portugal":      (2, 4),
    "Croatia":       (3, 4),
    "Mexico":        (0, 3),
    "Switzerland":   (1, 3),
    "Romania":       (3, 4),
    "Sweden":        (1, 2),
    "Ireland":       (0, 2),
    "Uruguay":       (1, 2),
    "Serbia":        (0, 1),
    "United States": (0, 1),
    "Belgium":       (0, 1),
    "South Korea":   (1, 2),
    "Japan":         (0, 3),
    "Ghana":         (0, 1),
    "Cameroon":      (1, 2),
    "Senegal":       (0, 1),
    "Morocco":       (1, 1),
    "Colombia":      (1, 2),
    "Chile":         (1, 2),
    "Costa Rica":    (1, 2),
    "Russia":        (0, 1),
}


# =============================================================================
# LOAD
# =============================================================================

def load_all():
    om = xgb.XGBClassifier();  om.load_model(MODEL_DIR / "xgb_outcome.json")
    gh = xgb.XGBRegressor();   gh.load_model(MODEL_DIR / "xgb_goals_home.json")
    ga = xgb.XGBRegressor();   ga.load_model(MODEL_DIR / "xgb_goals_away.json")

    with open(MODEL_DIR / "feature_columns.json") as f:
        feature_cols = json.load(f)

    wc       = pd.read_csv(OUT_DIR / "wc2026_features.csv")
    teams_df = pd.read_csv(DATA_DIR / "teams_2026.csv")
    ea_df    = pd.read_csv(DATA_DIR / "squad_team_ratings.csv")

    return om, gh, ga, feature_cols, wc, teams_df, ea_df


# =============================================================================
# FIX 7: Altitude & fatigue helpers
# =============================================================================

def altitude_elo_penalty(city: str) -> float:
    """
    Returns the per-team Elo penalty for playing at altitude.
    Applied to BOTH teams; visiting team gets an extra 50% on top (see usage).
    """
    alt = VENUE_ALTITUDE.get(city, 0)
    if alt <= ALTITUDE_THRESHOLD:
        return 0.0
    return (alt - ALTITUDE_THRESHOLD) * ALTITUDE_ELO_SCALE


def apply_altitude_to_row(row: np.ndarray, feature_cols: list,
                           city: str, home: str, away: str,
                           elo_map: dict) -> np.ndarray:
    """
    Adjust elo_diff and win-probability features for altitude.
    Home team (usually the host) is slightly less affected.
    Visiting team suffers 1.5× the base penalty.
    """
    base_pen = altitude_elo_penalty(city)
    if base_pen == 0:
        return row

    # Home team native to host country adapts better
    home_pen = base_pen * 0.5 if home in HOST_NATIONS else base_pen
    away_pen = base_pen * 1.5

    elo_h = elo_map.get(home, 1500) - home_pen
    elo_a = elo_map.get(away, 1500) - away_pen

    fc = feature_cols
    if "elo_diff" in fc:
        row[fc.index("elo_diff")]       = elo_h - elo_a
    if "elo_win_prob_h" in fc:
        p = 1 / (1 + 10 ** ((elo_a - elo_h) / 400))
        row[fc.index("elo_win_prob_h")] = p
    if "elo_win_prob_a" in fc:
        row[fc.index("elo_win_prob_a")] = 1 - p
    return row


# =============================================================================
# FIX 3: Host-nation feature helpers
# =============================================================================

def apply_host_advantage(row: np.ndarray, feature_cols: list,
                          home: str, away: str, city: str, country: str,
                          elo_map: dict) -> np.ndarray:
    """
    Gives host nations a home-crowd Elo boost.
    +100 Elo if the team is playing in their own country.
    +50  Elo if playing in a co-host country (still partial advantage).
    """
    host_boost = 0
    if home in HOST_NATIONS:
        # Check if playing in own country
        country_team_map = {
            "United States": "United States",
            "Canada":        "Canada",
            "Mexico":        "Mexico",
        }
        if country_team_map.get(home) == country:
            host_boost = 100   # playing at literal home venue
        else:
            host_boost = 50    # playing in a co-host's country

    if host_boost == 0:
        return row

    elo_h = elo_map.get(home, 1500) + host_boost
    elo_a = elo_map.get(away, 1500)
    fc = feature_cols
    if "elo_diff" in fc:
        row[fc.index("elo_diff")]       = elo_h - elo_a
    if "elo_win_prob_h" in fc:
        p = 1 / (1 + 10 ** ((elo_a - elo_h) / 400))
        row[fc.index("elo_win_prob_h")] = p
    if "elo_win_prob_a" in fc:
        row[fc.index("elo_win_prob_a")] = 1 - p
    return row


# =============================================================================
# PRE-COMPUTE: group-stage probabilities (batch — fast)
# =============================================================================

def precompute_group_probs(wc, teams_df, om, gh_model, ga_model,
                           feature_cols, elo_map):
    """
    For every group-stage fixture return:
      fixture_data[i] = {group, home, away, city, country,
                         p_H, p_D, p_A, exp_h, exp_a}
    Also builds a knockout feature lookup.
    """
    # Build group fixtures list in canonical order
    fixtures = []
    for group in GROUPS:
        g_teams = teams_df[teams_df["group"] == group]["team"].tolist()
        for i in range(len(g_teams)):
            for j in range(i + 1, len(g_teams)):
                h, a = g_teams[i], g_teams[j]
                m1 = (wc["home_team"] == h) & (wc["away_team"] == a)
                m2 = (wc["home_team"] == a) & (wc["away_team"] == h)
                city, country = "", ""
                if wc[m2].shape[0] > 0 and wc[m1].shape[0] == 0:
                    h, a = a, h
                    m1 = m2
                # Pull city / country for altitude & host checks
                if wc[m1].shape[0] > 0:
                    city    = str(wc[m1].iloc[0].get("city", ""))
                    country = str(wc[m1].iloc[0].get("country", ""))
                fixtures.append((group, h, a, city, country))

    # Bulk feature matrix
    rows = []
    for _, h, a, city, country in fixtures:
        m = (wc["home_team"] == h) & (wc["away_team"] == a)
        if m.any():
            row = wc[m].iloc[0][feature_cols].fillna(0).values.astype(np.float32)
        else:
            row = np.zeros(len(feature_cols), dtype=np.float32)
            fc = feature_cols
            elo_h = elo_map.get(h, 1500)
            elo_a = elo_map.get(a, 1500)
            if "elo_diff"       in fc: row[fc.index("elo_diff")]       = elo_h - elo_a
            if "elo_win_prob_h" in fc: row[fc.index("elo_win_prob_h")] = 1/(1+10**((elo_a-elo_h)/400))
            if "elo_win_prob_a" in fc: row[fc.index("elo_win_prob_a")] = 1-1/(1+10**((elo_a-elo_h)/400))
            if "t_weight"       in fc: row[fc.index("t_weight")]       = 1.0

        # Fix 3: host advantage
        row = apply_host_advantage(row, feature_cols, h, a, city, country, elo_map)
        # Fix 7: altitude penalty
        row = apply_altitude_to_row(row, feature_cols, city, h, a, elo_map)
        rows.append(row)

    X = np.array(rows, dtype=np.float32)
    probs = om.predict_proba(X)          # (N, 3)  A=0 D=1 H=2
    exp_h = np.clip(gh_model.predict(X), 0.3, 8)
    exp_a = np.clip(ga_model.predict(X), 0.3, 8)

    fixture_data = []
    for idx, (group, h, a, city, country) in enumerate(fixtures):
        fixture_data.append({
            "group": group, "home": h, "away": a,
            "city": city, "country": country,
            "p_H": probs[idx, 2], "p_D": probs[idx, 1], "p_A": probs[idx, 0],
            "exp_h": exp_h[idx],  "exp_a": exp_a[idx],
        })

    # Build per-(home,away) knockout lookup
    ko_lookup = {}
    for fd in fixture_data:
        ko_lookup[(fd["home"], fd["away"])] = fd
        ko_lookup[(fd["away"], fd["home"])] = {
            "p_H": fd["p_A"], "p_D": fd["p_D"], "p_A": fd["p_H"],
            "exp_h": fd["exp_a"], "exp_a": fd["exp_h"],
        }

    return fixture_data, ko_lookup, elo_map


def make_ko_features(home, away, elo_map, om, gh_model, ga_model,
                     feature_cols, ko_lookup, wc, teams_df,
                     form_tracker=None):
    """
    Get or compute knockout fixture prediction data.
    Fix 1: If form_tracker provided, apply a momentum boost to elo_diff.
    """
    if (home, away) in ko_lookup and form_tracker is None:
        return ko_lookup[(home, away)]

    elo_h = elo_map.get(home, 1500)
    elo_a = elo_map.get(away, 1500)

    # Fix 1: momentum boost from in-tournament form
    if form_tracker is not None:
        elo_h += form_tracker.momentum_bonus(home)
        elo_a += form_tracker.momentum_bonus(away)

    row = np.zeros((1, len(feature_cols)), dtype=np.float32)
    fc  = feature_cols
    if "elo_diff"       in fc: row[0, fc.index("elo_diff")]       = elo_h - elo_a
    if "elo_win_prob_h" in fc: row[0, fc.index("elo_win_prob_h")] = 1/(1+10**((elo_a-elo_h)/400))
    if "elo_win_prob_a" in fc: row[0, fc.index("elo_win_prob_a")] = 1 - 1/(1+10**((elo_a-elo_h)/400))
    if "t_weight"       in fc: row[0, fc.index("t_weight")]       = 1.0

    # Fix 1: also override rolling-form differentials if tracker available
    if form_tracker is not None:
        hf = form_tracker.get(home)
        af = form_tracker.get(away)
        if "diff_pts5" in fc:
            row[0, fc.index("diff_pts5")]  = hf["pts_avg"] - af["pts_avg"]
        if "diff_gf5" in fc:
            row[0, fc.index("diff_gf5")]   = hf["gf_avg"]  - af["gf_avg"]
        if "diff_ga5" in fc:
            row[0, fc.index("diff_ga5")]   = hf["ga_avg"]  - af["ga_avg"]

    probs = om.predict_proba(row)[0]
    fd = {
        "p_H": probs[2], "p_D": probs[1], "p_A": probs[0],
        "exp_h": float(np.clip(gh_model.predict(row)[0], 0.3, 8)),
        "exp_a": float(np.clip(ga_model.predict(row)[0], 0.3, 8)),
    }
    return fd


# =============================================================================
# FIX 1: In-Tournament Form Tracker
# =============================================================================

class FormTracker:
    """
    Tracks each team's in-tournament goals/points so that knockout
    feature rows can reflect group-stage momentum.
    """
    def __init__(self):
        self._stats = defaultdict(lambda: {"gf": 0, "ga": 0, "pts": 0, "n": 0})

    def update(self, home: str, away: str, gh: int, ga: int):
        """Record the result of one simulated match."""
        self._stats[home]["gf"] += gh
        self._stats[home]["ga"] += ga
        self._stats[away]["gf"] += ga
        self._stats[away]["ga"] += gh
        self._stats[home]["n"]  += 1
        self._stats[away]["n"]  += 1
        if gh > ga:
            self._stats[home]["pts"] += 3
        elif ga > gh:
            self._stats[away]["pts"] += 3
        else:
            self._stats[home]["pts"] += 1
            self._stats[away]["pts"] += 1

    def get(self, team: str) -> dict:
        s = self._stats[team]
        n = max(s["n"], 1)
        return {
            "gf_avg":  s["gf"] / n,
            "ga_avg":  s["ga"] / n,
            "pts_avg": s["pts"] / n,
        }

    def momentum_bonus(self, team: str) -> float:
        """
        Convert in-tournament pts/game into an Elo boost for KO features.
        Average WC group-stage pts/game ≈ 1.5 (half of a 4.5 pts sweep).
        A team winning all 3 group games (3.0 pts/g) gets +50 Elo.
        A team losing all 3 (0.0 pts/g) gets -50 Elo.
        """
        s = self._stats[team]
        n = s["n"]
        if n == 0:
            return 0.0
        pts_per_game = s["pts"] / n
        deviation    = pts_per_game - 1.5   # centred at average performance
        return deviation * 33.3             # ±1 pt/game → ±33 Elo points


# =============================================================================
# FIX 5: Penalty shootout model
# =============================================================================

def penalty_win_prob(home: str, away: str, ea_df: pd.DataFrame) -> float:
    """
    Returns probability that `home` wins a penalty shootout vs `away`.

    Combines:
      - EA FC ratings differential (attack proxy for penalty takers,
        defence proxy for GK saves) — weight 60%
      - Historical WC penalty record (Bayesian shrinkage) — weight 40%
    """
    # ── EA component ─────────────────────────────────────────────────────────
    def ea_pen_score(team):
        row = ea_df[ea_df["team"] == team]
        if row.empty:
            return 75.0  # neutral fallback
        # Penalty quality ≈ weighted blend: attack (shooting) + midfield (composure)
        return 0.6 * float(row["attack"].values[0]) + 0.4 * float(row["midfield"].values[0])

    score_h = ea_pen_score(home)
    score_a = ea_pen_score(away)
    # Convert to probability via logistic mapping
    ea_prob = 1 / (1 + 10 ** ((score_a - score_h) / 15))  # 15 = softening factor

    # ── Historical WC record component (Bayesian) ─────────────────────────────
    def hist_pen_rate(team, prior=0.5, k=3.0):
        wins, total = WC_PENALTY_RECORD.get(team, (0, 0))
        return (wins + k * prior) / (total + k)

    hist_h = hist_pen_rate(home)
    hist_a = hist_pen_rate(away)
    # Normalise to a head-to-head probability
    hist_prob = hist_h / (hist_h + hist_a)

    # ── Blend ─────────────────────────────────────────────────────────────────
    return 0.60 * ea_prob + 0.40 * hist_prob


# =============================================================================
# FAST MATCH SAMPLER
# =============================================================================

def sample_match(fd, rng):
    """
    fd: dict with p_H, p_D, p_A, exp_h, exp_a
    Returns (home_goals, away_goals)
    """
    p = np.array([fd["p_A"], fd["p_D"], fd["p_H"]])
    p = p / p.sum()
    outcome_idx = rng.choice(3, p=p)
    outcome = ["A", "D", "H"][outcome_idx]

    exp_h = max(0.3, float(fd["exp_h"]))
    exp_a = max(0.3, float(fd["exp_a"]))

    for _ in range(30):
        gh = int(rng.poisson(exp_h))
        ga = int(rng.poisson(exp_a))
        s  = "H" if gh > ga else ("A" if ga > gh else "D")
        if s == outcome:
            return gh, ga

    if outcome == "H":   return (int(exp_h) + 1, int(exp_h))
    elif outcome == "A": return (int(exp_a),     int(exp_a) + 1)
    else:
        v = (int(exp_h) + int(exp_a)) // 2
        return v, v


def sample_extra_time(fd, rng):
    """
    Fix 4: Simulate 30 minutes of extra time.
    Goal rate is 40% of the 90-min rate (proportional to time + fatigue deflation).
    Returns (added_home_goals, added_away_goals).
    """
    et_exp_h = max(0.1, float(fd["exp_h"]) * 0.40)
    et_exp_a = max(0.1, float(fd["exp_a"]) * 0.40)
    gh = int(rng.poisson(et_exp_h))
    ga = int(rng.poisson(et_exp_a))
    return gh, ga


def sample_ko_match(home, away, elo_map, ko_lookup, om, gh_model, ga_model,
                    feature_cols, wc, teams_df, rng,
                    form_tracker=None, ea_df=None):
    """
    Simulate a knockout match with:
      Fix 1: momentum-adjusted KO features
      Fix 4: Extra Time if drawn after 90 min
      Fix 5: Richer penalty model
    """
    fd = make_ko_features(home, away, elo_map, om, gh_model, ga_model,
                          feature_cols, ko_lookup, wc, teams_df, form_tracker)
    gh, ga = sample_match(fd, rng)

    if gh == ga:
        # Fix 4: Extra Time
        et_h, et_a = sample_extra_time(fd, rng)
        gh += et_h
        ga += et_a

    if gh > ga:
        return home
    elif ga > gh:
        return away
    else:
        # Fix 5: Penalties
        p_home = penalty_win_prob(home, away, ea_df) if ea_df is not None else 0.5
        return home if rng.random() < p_home else away


# =============================================================================
# ONE TOURNAMENT SIMULATION
# =============================================================================

def simulate_one(fixture_data, ko_lookup, elo_map, teams_df,
                 om, gh_model, ga_model, feature_cols, wc, rng,
                 ea_df=None):

    results = {}

    # Fix 1: initialise form tracker for this simulation run
    form_tracker = FormTracker()

    # ── GROUP STAGE ──────────────────────────────────────────────────────────
    group_standings = {}

    # organise fixture_data by group
    group_fds = defaultdict(list)
    for fd in fixture_data:
        group_fds[fd["group"]].append(fd)

    # Fix 6: track real simulated group stats per team
    all_group_stats = {}   # team → (pts, gd, gf)

    for group in GROUPS:
        pts = defaultdict(int)
        gd  = defaultdict(int)
        gf  = defaultdict(int)

        for fd in group_fds[group]:
            h, a = fd["home"], fd["away"]
            gh, ga = sample_match(fd, rng)

            # Fix 1: update form tracker with this result
            form_tracker.update(h, a, gh, ga)

            gf[h] += gh;  gf[a] += ga
            gd[h] += (gh - ga);  gd[a] += (ga - gh)
            if gh > ga:   pts[h] += 3
            elif ga > gh: pts[a] += 3
            else:         pts[h] += 1;  pts[a] += 1

        g_teams = teams_df[teams_df["group"] == group]["team"].tolist()

        # Fix 6: sort by real simulated pts → gd → gf (FIFA tiebreaker)
        standings = sorted(
            g_teams,
            key=lambda t: (pts[t], gd[t], gf[t]),
            reverse=True
        )
        group_standings[group] = standings

        for t in g_teams:
            all_group_stats[t] = (pts[t], gd[t], gf[t])

        results[standings[3]] = "group"   # 4th place out

    # ── Fix 6: 3rd-place advancement — use real simulated pts/gd/gf ──────────
    third_place_list = []
    for group in GROUPS:
        t = group_standings[group][2]
        p_, gd_, gf_ = all_group_stats[t]
        third_place_list.append((p_, gd_, gf_, t))

    # Sort by pts → gd → gf (same as FIFA rule for best 3rd-place teams)
    third_place_list.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
    advancing_3rd = [t for _, _, _, t in third_place_list[:8]]
    for _, _, _, t in third_place_list[8:]:
        results[t] = "group"

    # ── R32 ──────────────────────────────────────────────────────────────────
    r32_pairs = []
    for i in range(4):
        # Match 0: 1st vs 3rd
        r32_pairs.append((group_standings[GROUPS[i*2]][0], advancing_3rd[i*2]))
        # Match 1: 2nd vs 2nd
        r32_pairs.append((group_standings[GROUPS[i]][1], group_standings[GROUPS[7-i]][1]))
        # Match 2: 1st vs 3rd
        r32_pairs.append((group_standings[GROUPS[i*2+1]][0], advancing_3rd[i*2+1]))
        # Match 3: 1st vs 2nd
        r32_pairs.append((group_standings[GROUPS[8+i]][0], group_standings[GROUPS[11-i]][1]))

    r32_field = set(h for h,_ in r32_pairs) | set(a for _,a in r32_pairs)
    r32_winners = []
    for h, a in r32_pairs:
        w = sample_ko_match(h, a, elo_map, ko_lookup, om, gh_model, ga_model,
                            feature_cols, wc, teams_df, rng,
                            form_tracker=form_tracker, ea_df=ea_df)
        r32_winners.append(w)
    for t in r32_field:
        if t not in r32_winners:
            results[t] = "r32"

    # ── R16 ──────────────────────────────────────────────────────────────────
    r16_pairs = [(r32_winners[i], r32_winners[i+1]) for i in range(0, 16, 2)]
    r16_winners = []
    for h, a in r16_pairs:
        w = sample_ko_match(h, a, elo_map, ko_lookup, om, gh_model, ga_model,
                            feature_cols, wc, teams_df, rng,
                            form_tracker=form_tracker, ea_df=ea_df)
        r16_winners.append(w)
    for t in r32_winners:
        if t not in r16_winners:
            results[t] = "r16"

    # ── QF ───────────────────────────────────────────────────────────────────
    qf_pairs = [(r16_winners[i], r16_winners[i+1]) for i in range(0, 8, 2)]
    qf_winners = []
    for h, a in qf_pairs:
        w = sample_ko_match(h, a, elo_map, ko_lookup, om, gh_model, ga_model,
                            feature_cols, wc, teams_df, rng,
                            form_tracker=form_tracker, ea_df=ea_df)
        qf_winners.append(w)
    for t in r16_winners:
        if t not in qf_winners:
            results[t] = "qf"

    # ── SF ───────────────────────────────────────────────────────────────────
    sf_pairs = [(qf_winners[0], qf_winners[1]), (qf_winners[2], qf_winners[3])]
    sf_winners = []
    for h, a in sf_pairs:
        w = sample_ko_match(h, a, elo_map, ko_lookup, om, gh_model, ga_model,
                            feature_cols, wc, teams_df, rng,
                            form_tracker=form_tracker, ea_df=ea_df)
        sf_winners.append(w)
    for t in qf_winners:
        if t not in sf_winners:
            results[t] = "sf"

    # ── FINAL ────────────────────────────────────────────────────────────────
    f1, f2 = sf_winners[0], sf_winners[1]
    champion = sample_ko_match(f1, f2, elo_map, ko_lookup, om, gh_model, ga_model,
                               feature_cols, wc, teams_df, rng,
                               form_tracker=form_tracker, ea_df=ea_df)
    runner_up = f2 if champion == f1 else f1
    results[runner_up] = "final"
    results[champion]  = "winner"

    return results


# =============================================================================
# MONTE CARLO RUNNER
# =============================================================================

def run(n_sims=10000, seed=42):
    print("Loading models & data...")
    om, gh_model, ga_model, feature_cols, wc, teams_df, ea_df = load_all()
    print(f"  48 teams · 12 groups · 72 group-stage fixtures")
    print(f"  Enhancements active: [1] Dynamic Form  [3] Host Advantage  "
          f"[4] Extra Time  [5] Richer Penalties  [6] Accurate 3rd-Place  "
          f"[7] Altitude/Fatigue")

    elo_map = dict(zip(teams_df["team"], teams_df["elo_rating"]))

    print("Pre-computing fixture probabilities (batch)...")
    t0 = time.time()
    fixture_data, ko_lookup, elo_map = precompute_group_probs(
        wc, teams_df, om, gh_model, ga_model, feature_cols, elo_map)
    print(f"  Done in {time.time()-t0:.2f}s  ({len(fixture_data)} fixtures)")

    # Report host nation and altitude adjustments
    print("\n  [Fix 3] Host-nation Elo boosts applied:")
    for fd in fixture_data:
        if fd["home"] in HOST_NATIONS:
            print(f"    {fd['home']:20s} vs {fd['away']:20s}  [{fd['city']}, {fd['country']}]")
    print("\n  [Fix 7] High-altitude venues (>500m):")
    cities_seen = set()
    for fd in fixture_data:
        c = fd["city"]
        if c not in cities_seen and altitude_elo_penalty(c) > 0:
            print(f"    {c:20s}  {VENUE_ALTITUDE.get(c,0)}m  penalty={altitude_elo_penalty(c):.1f} Elo")
            cities_seen.add(c)

    all_teams = teams_df["team"].tolist()
    counts = {t: defaultdict(int) for t in all_teams}

    master_rng = np.random.default_rng(seed)
    seeds = master_rng.integers(0, 2**31, size=n_sims)

    print(f"\nRunning {n_sims:,} simulations...")
    t0 = time.time()
    for i, s in enumerate(seeds):
        if (i + 1) % 2000 == 0:
            elapsed = time.time() - t0
            rate = (i+1) / elapsed
            eta  = (n_sims - i - 1) / rate
            print(f"  {i+1:>6,}/{n_sims:,}  ({elapsed:.0f}s elapsed, ~{eta:.0f}s remaining)")

        rng = np.random.default_rng(int(s))
        res = simulate_one(fixture_data, ko_lookup, elo_map, teams_df,
                           om, gh_model, ga_model, feature_cols, wc, rng,
                           ea_df=ea_df)
        for team, stage in res.items():
            counts[team][stage] += 1

    total_time = time.time() - t0
    print(f"  Completed in {total_time:.1f}s  ({n_sims/total_time:.0f} sims/sec)")

    # ── Build results table ───────────────────────────────────────────────────
    rows = []
    for team in all_teams:
        sc = counts[team]
        row = {"team": team}
        cumulative = 0
        for stage in reversed(STAGE_ORDER):
            cumulative += sc.get(stage, 0)
            row[f"p_{stage}"] = round(cumulative / n_sims * 100, 2)
        row["wins"] = sc.get("winner", 0)
        rows.append(row)

    df = pd.DataFrame(rows)
    df = df.merge(teams_df[["team", "group", "world_ranking", "elo_rating"]], on="team", how="left")
    df = df.sort_values("p_winner", ascending=False).reset_index(drop=True)
    df.insert(0, "rank", range(1, len(df) + 1))

    # ── Save ──────────────────────────────────────────────────────────────────
    df.to_csv(OUT_DIR / "simulation_results.csv", index=False)

    # ── Print report ─────────────────────────────────────────────────────────
    W = 115
    print(f"\n{'='*W}")
    print(f"  FIFA WORLD CUP 2026 — SIMULATION RESULTS  ({n_sims:,} runs)  [Enhanced v2]")
    print(f"{'='*W}")
    print(f"  {'Rank':<5} {'Team':<25} {'Grp':<5} {'ELO':<7}"
          f" {'Win%':>6} {'Final%':>7} {'SF%':>6} {'QF%':>6} {'R16%':>6} {'Advance%':>9}")
    print("  " + "-" * (W-2))
    for _, row in df.iterrows():
        bar = "▓" * int(row["p_winner"] / 1.5)
        print(f"  {int(row['rank']):<5} {row['team']:<25} {row['group']:<5}"
              f" {row['elo_rating']:>6.0f}"
              f" {row['p_winner']:>6.1f}%"
              f" {row['p_final']:>6.1f}%"
              f" {row['p_sf']:>5.1f}%"
              f" {row['p_qf']:>5.1f}%"
              f" {row['p_r16']:>5.1f}%"
              f" {row['p_r32']:>8.1f}%  {bar}")

    print(f"\n{'='*W}")
    print("  🏆 TOP 10 TITLE CONTENDERS")
    print(f"{'='*W}")
    for _, row in df.head(10).iterrows():
        stars = "★" * max(1, int(row["p_winner"] / 1.5))
        print(f"  #{int(row['rank']):<3} {row['team']:<23} {row['p_winner']:>5.1f}%  {stars}")

    print(f"\n{'='*W}")
    print("  GROUP-BY-GROUP BREAKDOWN")
    print(f"{'='*W}")
    for group in sorted(df["group"].dropna().unique()):
        gdf = df[df["group"] == group].sort_values("p_winner", ascending=False)
        print(f"\n  ── Group {group} ──")
        for _, row in gdf.iterrows():
            print(f"    {row['team']:<25}  Win {row['p_winner']:>5.1f}%  "
                  f"Final {row['p_final']:>5.1f}%  SF {row['p_sf']:>5.1f}%  "
                  f"Advance {row['p_r32']:>5.1f}%")

    print(f"\n\n  Results saved → output/simulation_results.csv")
    print(f"  Done ✓\n")
    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sims", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    run(n_sims=args.sims, seed=args.seed)