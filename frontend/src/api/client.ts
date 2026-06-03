const API_BASE = 'http://localhost:8000';

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

export const checkHealth    = () => apiFetch('/');
export const getSquads      = () => apiFetch('/api/squads');
export const getLeaderboard = () => apiFetch('/api/leaderboard');
export const predictMatch   = (teamA: string, teamB: string, venue?: string) =>
  apiFetch('/api/predict_match', { method: 'POST', body: JSON.stringify({ team_a: teamA, team_b: teamB, venue }) });
export const whatIfPredict  = (teamA: string, teamB: string, venue?: string, adjustments?: Record<string, any>) =>
  apiFetch('/api/what_if_predict', { method: 'POST', body: JSON.stringify({ team_a: teamA, team_b: teamB, venue, adjustments }) });
export const startTournament     = () => apiFetch('/api/tournament/start', { method: 'POST' });
export const getTournamentState  = () => apiFetch('/api/tournament/state');
export const simulateStage       = () => apiFetch('/api/tournament/simulate_stage', { method: 'POST' });
export const injurePlayer  = (team: string, player: string) =>
  apiFetch('/api/injure_player', { method: 'POST', body: JSON.stringify({ team, player: player }) });
export const restorePlayer = (team: string, player: string) =>
  apiFetch('/api/restore_player', { method: 'POST', body: JSON.stringify({ team, player: player }) });
