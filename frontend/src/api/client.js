// API base URL — change to your backend URL in production
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

// ── Health ───────────────────────────────────────────────────
export const checkHealth = () => request('GET', '/');

// ── Squads ───────────────────────────────────────────────────
export const getSquads = () => request('GET', '/api/squads');

// ── Player actions ───────────────────────────────────────────
export const injurePlayer  = (team, player) => request('POST', '/api/injure_player',  { team, player });
export const restorePlayer = (team, player) => request('POST', '/api/restore_player', { team, player });



// ── Step-by-step tournament ──────────────────────────────────
export const startTournament    = (seed = null) =>
  request('POST', `/api/tournament/start${seed !== null ? `?seed=${seed}` : ''}`);
export const getTournamentState = () => request('GET', '/api/tournament/state');
export const simulateStage      = () => request('POST', '/api/tournament/simulate_stage');
export const simulateDay        = (match_ids) => request('POST', '/api/tournament/simulate_day', { match_ids });



// ── Batch simulation ─────────────────────────────────────────
export const getGroupFixtures   = ()              => request('GET',  '/api/group_fixtures');
export const simulateBatch      = (matches, n=5000) => request('POST', '/api/simulate_batch', { matches, n_sims: n });
