"""
WC 2026 Match Prediction — Model Training
==========================================
Reads:   output/match_features.csv
Saves:   models/xgb_outcome.json       (outcome classifier  H / D / A)
         models/xgb_goals_home.json    (home goals regressor)
         models/xgb_goals_away.json    (away goals regressor)
         models/feature_columns.json   (ordered list of feature names)
         models/label_encoder.json     (class → int mapping)

Run:
    python train_model.py

Prints a full evaluation report and cross-validation scores.
"""

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    mean_absolute_error
)
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR   = Path("data")
OUT_DIR    = Path("output")
MODEL_DIR  = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

FEATURES_FILE = OUT_DIR / "match_features.csv"

# ── Feature columns (everything except meta + targets) ───────────────────────
META_COLS   = ["date", "home_team", "away_team", "neutral", "tournament"]
TARGET_COLS = ["outcome", "home_goals", "away_goals", "goal_diff", "total_goals"]
DROP_COLS   = META_COLS + TARGET_COLS + ["elo_home", "elo_away"]


# ═════════════════════════════════════════════════════════════════════════════
# 1. LOAD & PREPARE
# ═════════════════════════════════════════════════════════════════════════════

def load_features(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"])
    df = df.dropna(subset=["outcome"])
    df = df.sort_values("date").reset_index(drop=True)
    return df


def prepare_X_y(df: pd.DataFrame):
    feature_cols = [c for c in df.columns if c not in DROP_COLS]
    X = df[feature_cols].select_dtypes(include=[np.number])
    feature_cols = list(X.columns)
    X = X.fillna(X.median())

    # ── H2H dampening: scale H2H columns by 0.5 before training ─────────────
    # XGBoost chooses splits by absolute gain; halving a feature group forces
    # it to be twice as predictive before it wins a split vs Elo/form features.
    # This is a soft per-group regularisation without a custom objective.
    H2H_COLS  = [c for c in feature_cols if c.startswith("h2h_")]
    H2H_SCALE = 0.25
    for col in H2H_COLS:
        X[col] = X[col] * H2H_SCALE
    print(f"  H2H columns scaled {H2H_SCALE}x: {H2H_COLS}")

    le = LabelEncoder()
    y_outcome    = le.fit_transform(df["outcome"])   # A=0, D=1, H=2
    y_home_goals = df["home_goals"].astype(float)
    y_away_goals = df["away_goals"].astype(float)

    return X, y_outcome, y_home_goals, y_away_goals, feature_cols, le


# ═════════════════════════════════════════════════════════════════════════════
# 2. MODEL DEFINITIONS
# ═════════════════════════════════════════════════════════════════════════════

OUTCOME_PARAMS = dict(
    objective        = "multi:softprob",
    num_class        = 3,
    n_estimators     = 500,
    learning_rate    = 0.05,
    max_depth        = 4,
    subsample        = 0.80,
    colsample_bytree = 0.75,
    min_child_weight = 8,
    gamma            = 1.5,
    reg_alpha        = 0.5,
    reg_lambda       = 2.0,
    eval_metric      = "mlogloss",
    random_state     = 42,
    n_jobs           = -1,
)

GOALS_PARAMS = dict(
    objective        = "reg:squarederror",
    n_estimators     = 400,
    learning_rate    = 0.05,
    max_depth        = 3,
    subsample        = 0.80,
    colsample_bytree = 0.75,
    min_child_weight = 5,
    reg_alpha        = 0.3,
    reg_lambda       = 2.0,
    random_state     = 42,
    n_jobs           = -1,
)


# ═════════════════════════════════════════════════════════════════════════════
# 3. CROSS-VALIDATION
# ═════════════════════════════════════════════════════════════════════════════

def cross_validate_outcome(X, y, params):
    model  = xgb.XGBClassifier(**params)
    tscv   = TimeSeriesSplit(n_splits=5)
    scores = cross_val_score(model, X, y, cv=tscv, scoring="accuracy", n_jobs=-1)
    return scores


# ═════════════════════════════════════════════════════════════════════════════
# 4. TRAIN & EVALUATE
# ═════════════════════════════════════════════════════════════════════════════

def train_outcome_model(X, y, le):
    model   = xgb.XGBClassifier(**OUTCOME_PARAMS)
    model.fit(X, y)
    y_pred  = model.predict(X)
    acc     = accuracy_score(y, y_pred)
    classes = le.classes_

    print(f"\n{'='*60}")
    print("OUTCOME MODEL — TRAINING SET REPORT")
    print(f"{'='*60}")
    print(f"  Accuracy (train)   : {acc:.4f}")
    print(f"\n  Classification Report:")
    print(classification_report(y, y_pred, target_names=classes, digits=3))
    print("  Confusion Matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y, y_pred)
    print(pd.DataFrame(cm, index=classes, columns=classes).to_string())

    return model


def train_goals_model(X, y_home, y_away):
    m_home = xgb.XGBRegressor(**GOALS_PARAMS)
    m_away = xgb.XGBRegressor(**GOALS_PARAMS)
    m_home.fit(X, y_home)
    m_away.fit(X, y_away)

    mae_h = mean_absolute_error(y_home, m_home.predict(X))
    mae_a = mean_absolute_error(y_away, m_away.predict(X))
    print(f"\n{'='*60}")
    print("GOALS MODELS — TRAINING SET REPORT")
    print(f"{'='*60}")
    print(f"  Home goals MAE  : {mae_h:.4f}")
    print(f"  Away goals MAE  : {mae_a:.4f}")

    return m_home, m_away


# ═════════════════════════════════════════════════════════════════════════════
# 5. FEATURE IMPORTANCE
# ═════════════════════════════════════════════════════════════════════════════

def print_top_features(model, feature_cols, n=20):
    imp = pd.Series(model.feature_importances_, index=feature_cols)
    imp = imp.sort_values(ascending=False).head(n)
    print(f"\n{'='*60}")
    print(f"TOP {n} FEATURES (outcome model)")
    print(f"{'='*60}")
    for feat, score in imp.items():
        bar = "█" * int(score * 300)
        print(f"  {feat:<38s}  {score:.4f}  {bar}")


# ═════════════════════════════════════════════════════════════════════════════
# 6. SAVE ARTIFACTS
# ═════════════════════════════════════════════════════════════════════════════

def save_models(outcome_model, goals_home, goals_away, feature_cols, le):
    outcome_model.save_model(MODEL_DIR / "xgb_outcome.json")
    goals_home.save_model(MODEL_DIR    / "xgb_goals_home.json")
    goals_away.save_model(MODEL_DIR    / "xgb_goals_away.json")

    with open(MODEL_DIR / "feature_columns.json", "w") as f:
        json.dump(feature_cols, f, indent=2)

    label_map = {cls: int(i) for i, cls in enumerate(le.classes_)}
    with open(MODEL_DIR / "label_encoder.json", "w") as f:
        json.dump(label_map, f, indent=2)

    print(f"\n{'='*60}")
    print("MODELS SAVED TO  models/")
    print(f"{'='*60}")
    for fname in ["xgb_outcome.json", "xgb_goals_home.json",
                  "xgb_goals_away.json", "feature_columns.json", "label_encoder.json"]:
        p = MODEL_DIR / fname
        size = p.stat().st_size / 1024
        print(f"  {fname:<35s}  {size:.1f} KB")


# ═════════════════════════════════════════════════════════════════════════════
# 7. MAIN
# ═════════════════════════════════════════════════════════════════════════════

def run():
    print("Loading features...")
    df = load_features(FEATURES_FILE)
    print(f"  {len(df)} matches  ×  {len(df.columns)} raw columns")

    print("Preparing X / y ...")
    X, y_outcome, y_home, y_away, feature_cols, le = prepare_X_y(df)
    print(f"  Feature matrix shape : {X.shape}")
    print(f"  Outcome classes      : {list(le.classes_)}  →  {list(range(len(le.classes_)))}")
    dist = dict(zip(*np.unique(y_outcome, return_counts=True)))
    dist_named = {le.classes_[k]: v for k, v in dist.items()}
    print(f"  Class distribution   : {dist_named}")

    print("\nRunning 5-fold time-series cross-validation...")
    cv_scores = cross_validate_outcome(X, y_outcome, OUTCOME_PARAMS)
    print(f"  CV Accuracy : {cv_scores.mean():.4f}  ±  {cv_scores.std():.4f}")
    print(f"  Per-fold    : {[round(s, 4) for s in cv_scores]}")

    print("\nTraining outcome classifier on full dataset...")
    outcome_model = train_outcome_model(X, y_outcome, le)

    print("\nTraining goals regressors...")
    goals_home, goals_away = train_goals_model(X, y_home, y_away)

    print_top_features(outcome_model, feature_cols)

    save_models(outcome_model, goals_home, goals_away, feature_cols, le)

    print("\nDone ✓  —  Ready for predict_wc.py\n")


if __name__ == "__main__":
    run()

