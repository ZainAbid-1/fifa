import { useEffect, useState, useCallback } from 'react';
import {
  startTournament, getTournamentState, simulateStage,
  injurePlayer, restorePlayer, getSquads,
} from '../api/client';
import './TournamentSimulator.css';

const STAGE_LABELS = {
  not_started: 'Not Started',
  group_stage: 'Group Stage',
  r32:         'Round of 32',
  r16:         'Round of 16',
  qf:          'Quarter Finals',
  sf:          'Semi Finals',
  final:       'Final',
  finished:    'Finished',
};

const STAGE_ORDER = ['group_stage', 'r32', 'r16', 'qf', 'sf', 'final', 'finished'];

function StagePip({ stage, current }) {
  const idx = STAGE_ORDER.indexOf(stage);
  const curIdx = STAGE_ORDER.indexOf(current);
  const done = curIdx > idx;
  const active = curIdx === idx;
  return (
    <div className={`stage-pip ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <div className="stage-pip-dot" />
      <span className="stage-pip-label">{STAGE_LABELS[stage]}</span>
    </div>
  );
}

function MatchCard({ match, small }) {
  const isKO = match.winner !== undefined && match.home_goals !== null;
  const homeWon = match.winner === match.home;
  const awayWon = match.winner === match.away;

  return (
    <div className={`sim-match-card ${small ? 'sim-match-card--small' : ''} ${!match.played ? 'sim-match-card--pending' : ''}`}>
      {match.group && <span className="sim-match-group label">Group {match.group}</span>}
      <div className="sim-match-row">
        <span className={`sim-match-team ${homeWon ? 'sim-match-team--winner' : ''}`}>{match.home}</span>
        <div className="sim-match-score">
          {match.played ? (
            <>
              <span className={homeWon ? 'score-win' : ''}>{match.home_goals}</span>
              <span className="score-sep">–</span>
              <span className={awayWon ? 'score-win' : ''}>{match.away_goals}</span>
            </>
          ) : (
            <span className="score-vs">vs</span>
          )}
        </div>
        <span className={`sim-match-team sim-match-team--away ${awayWon ? 'sim-match-team--winner' : ''}`}>{match.away}</span>
      </div>
      {match.played && match.win_reason && match.win_reason !== '90m' && (
        <div className="sim-match-meta">
          {match.extra_time && <span className="badge badge-muted" style={{fontSize:'0.65rem'}}>AET</span>}
          {match.penalties && (
            <span className="badge badge-gold" style={{fontSize:'0.65rem'}}>
              Pens {match.pen_home_score}–{match.pen_away_score}
            </span>
          )}
        </div>
      )}
      {match.venue && !small && <div className="sim-match-venue label text-muted">{match.venue}</div>}
    </div>
  );
}

function StandingsTable({ group, rows }) {
  return (
    <div className="standings-group">
      <div className="standings-group-title">
        <span className="badge badge-cyan">Group {group}</span>
      </div>
      <div className="standings-table">
        <div className="standings-head">
          <span className="st-team">Team</span>
          <span className="st-num">P</span>
          <span className="st-num">W</span>
          <span className="st-num">D</span>
          <span className="st-num">L</span>
          <span className="st-num">GF</span>
          <span className="st-num">GA</span>
          <span className="st-num">GD</span>
          <span className="st-num bold">Pts</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.team} className={`standings-row ${i < 2 ? 'standings-row--qualify' : i === 2 ? 'standings-row--third' : ''}`}>
            <span className="st-team">
              <span className="st-pos-num">{i + 1}</span>
              {r.team}
            </span>
            <span className="st-num">{r.played}</span>
            <span className="st-num">{r.won}</span>
            <span className="st-num">{r.drawn}</span>
            <span className="st-num">{r.lost}</span>
            <span className="st-num">{r.gf}</span>
            <span className="st-num">{r.ga}</span>
            <span className="st-num">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
            <span className="st-num bold text-cyan">{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InjuryManager({ squads, onToggle, busy }) {
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch]         = useState('');

  const teams = squads.map(t => t.team).sort();
  const selectedSquad = squads.find(t => t.team === teamFilter);
  const filteredPlayers = selectedSquad?.players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="injury-manager card">
      <h3 className="display-md mb-16">Injury Manager</h3>
      <p className="text-muted mb-16" style={{ fontSize: '0.85rem' }}>
        Mark players as injured before simulating a stage to affect team ratings and outcomes.
      </p>
      <div className="col gap-12">
        <select
          id="injury-team-select"
          className="input"
          value={teamFilter}
          onChange={e => { setTeamFilter(e.target.value); setSearch(''); }}
        >
          <option value="">Select a team...</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {selectedSquad && (
          <>
            <input
              className="input"
              placeholder="Search player..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="injury-player-list">
              {filteredPlayers.map(p => (
                <div key={p.name} className={`injury-player-row ${p.injured ? 'injury-player-row--injured' : ''}`}>
                  <span className="injury-player-pos">{p.position}</span>
                  <span className="injury-player-name">{p.name}</span>
                  <span className="injury-player-rating">{p.overall}</span>
                  {p.injured && <span className="badge badge-red" style={{fontSize:'0.65rem'}}>INJ</span>}
                  <button
                    className={`btn btn-sm ${p.injured ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                    onClick={() => onToggle(teamFilter, p)}
                    disabled={busy === p.name}
                  >
                    {busy === p.name ? '...' : p.injured ? 'Restore' : 'Injure'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TournamentSimulator() {
  const [state, setState]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [simBusy, setSimBusy]   = useState(false);
  const [squads, setSquads]     = useState([]);
  const [injBusy, setInjBusy]   = useState(null);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('progress');

  // Load initial state & squads
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getTournamentState().catch(() => null),
      getSquads().catch(() => ({ teams: [] })),
    ]).then(([st, sq]) => {
      if (st) setState(st);
      setSquads(sq.teams || []);
    }).finally(() => setLoading(false));
  }, []);

  const refreshState = useCallback(() =>
    getTournamentState().then(setState).catch(console.error), []);

  async function handleStart() {
    setSimBusy(true); setError(null);
    try {
      await startTournament();
      await refreshState();
    } catch (e) { setError(e.message); }
    finally { setSimBusy(false); }
  }

  async function handleSimulateStage() {
    setSimBusy(true); setError(null);
    try {
      await simulateStage();
      await refreshState();
    } catch (e) { setError(e.message); }
    finally { setSimBusy(false); }
  }

  async function handleToggleInjury(team, player) {
    setInjBusy(player.name);
    try {
      const fn = player.injured ? restorePlayer : injurePlayer;
      const res = await fn(team, player.name);
      setSquads(prev => prev.map(t => {
        if (t.team !== team) return t;
        return {
          ...t, rating: res.new_rating,
          players: t.players.map(p =>
            p.name === player.name ? { ...p, injured: !player.injured } : p
          ),
        };
      }));
    } catch (e) { console.error(e); }
    finally { setInjBusy(null); }
  }

  const stage = state?.stage || 'not_started';
  const canStart    = stage === 'not_started' || stage === 'finished';
  const canSimulate = stage !== 'not_started' && stage !== 'finished';

  const fixtures    = state?.fixtures || {};
  const standings   = state?.standings || {};
  const groups      = Object.keys(standings).sort();
  const stageFixtures = stage !== 'not_started' && stage !== 'finished'
    ? (fixtures[stage] || [])
    : [];

  // All played KO fixtures for history
  const koHistory = ['r32','r16','qf','sf','final']
    .flatMap(s => (fixtures[s] || []).filter(m => m.played));

  return (
    <main className="simulator-page page">
      <div className="page-header">
        <div className="container">
          <div className="line-cyan" style={{ margin: '0 auto 16px' }} />
          <h1 className="display-lg center">Tournament Simulator</h1>
          <p className="text-muted center mt-8">
            Step through every stage. Pause, manage injuries, then simulate.
          </p>
        </div>
      </div>

      <div className="container">
        {/* ── Stage Progress Bar ── */}
        <div className="stage-progress card animate-up mb-24">
          <div className="stage-progress-track">
            {STAGE_ORDER.slice(0, -1).map(s => (
              <StagePip key={s} stage={s} current={stage} />
            ))}
          </div>
          {state?.champion && (
            <div className="champion-banner">
              <span className="label text-gold">World Cup Champion</span>
              <span className="champion-name display-md text-gold">{state.champion}</span>
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <div className="sim-actions animate-up delay-1">
          <button
            id="start-tournament-btn"
            className="btn btn-primary btn-lg"
            onClick={handleStart}
            disabled={simBusy || (!canStart)}
          >
            {simBusy && stage === 'not_started' ? <><div className="spinner spinner-sm" /> Starting...</> : canStart ? 'Start New Tournament' : 'Restart Tournament'}
          </button>

          {canSimulate && (
            <button
              id="simulate-stage-btn"
              className="btn btn-secondary btn-lg"
              onClick={handleSimulateStage}
              disabled={simBusy}
            >
              {simBusy
                ? <><div className="spinner spinner-sm" /> Simulating {STAGE_LABELS[stage]}...</>
                : `Simulate ${STAGE_LABELS[stage]}`}
            </button>
          )}

          <div className="sim-stage-badge">
            <span className={`badge ${stage === 'finished' ? 'badge-gold' : stage === 'not_started' ? 'badge-muted' : 'badge-cyan'}`}>
              {STAGE_LABELS[stage]}
            </span>
          </div>
        </div>

        {error && (
          <div className="sim-error animate-in">
            {error}
          </div>
        )}

        {loading && (
          <div className="loading-state"><div className="spinner" /><span className="text-muted">Loading...</span></div>
        )}

        {/* ── Tab Bar ── */}
        {state && stage !== 'not_started' && (
          <div className="tab-bar animate-up delay-2 mt-24 mb-24">
            <button className={`tab-btn ${tab === 'progress' ? 'active' : ''}`} onClick={() => setTab('progress')}>Current Stage</button>
            <button className={`tab-btn ${tab === 'groups'   ? 'active' : ''}`} onClick={() => setTab('groups')}>Group Standings</button>
            <button className={`tab-btn ${tab === 'ko'       ? 'active' : ''}`} onClick={() => setTab('ko')}>KO Results</button>
            <button className={`tab-btn ${tab === 'injuries' ? 'active' : ''}`} onClick={() => setTab('injuries')}>Injuries</button>
          </div>
        )}

        {/* ── Tab: Current Stage ── */}
        {tab === 'progress' && state && stage !== 'not_started' && (
          <div className="animate-in">
            {stage === 'group_stage' && fixtures.group_stage?.length > 0 && (
              <div>
                <h3 className="display-md mb-16">Group Stage Fixtures</h3>
                <div className="sim-fixtures-grid">
                  {fixtures.group_stage.map(m => (
                    <MatchCard key={m.id} match={m} small />
                  ))}
                </div>
              </div>
            )}

            {stage !== 'group_stage' && stage !== 'finished' && stageFixtures.length > 0 && (
              <div>
                <h3 className="display-md mb-16">{STAGE_LABELS[stage]} — Upcoming</h3>
                <div className="sim-ko-grid">
                  {stageFixtures.map(m => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            )}

            {stage === 'finished' && (
              <div className="finished-screen center">
                <div className="trophy-icon">
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="1.5">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                    <path d="M4 22h16"/>
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                  </svg>
                </div>
                <h2 className="display-lg text-gold mt-16">{state.champion}</h2>
                <p className="text-muted mt-8">Are your 2026 World Cup Champions</p>
                <button className="btn btn-gold btn-lg mt-24" onClick={handleStart}>
                  Simulate Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Group Standings ── */}
        {tab === 'groups' && (
          <div className="animate-in">
            {groups.length === 0 ? (
              <div className="empty-state"><p>Simulate the Group Stage first.</p></div>
            ) : (
              <div className="standings-grid">
                {groups.map(g => (
                  <StandingsTable key={g} group={g} rows={standings[g] || []} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: KO Results ── */}
        {tab === 'ko' && (
          <div className="animate-in">
            {koHistory.length === 0 ? (
              <div className="empty-state"><p>No knockout matches played yet.</p></div>
            ) : (
              ['r32','r16','qf','sf','final'].map(s => {
                const played = (fixtures[s] || []).filter(m => m.played);
                if (!played.length) return null;
                return (
                  <div key={s} className="ko-stage-section">
                    <h3 className="display-md mb-12">{STAGE_LABELS[s]}</h3>
                    <div className="sim-ko-grid">
                      {played.map(m => <MatchCard key={m.id} match={m} />)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Tab: Injuries ── */}
        {tab === 'injuries' && (
          <div className="animate-in">
            <InjuryManager
              squads={squads}
              onToggle={handleToggleInjury}
              busy={injBusy}
            />
          </div>
        )}
      </div>
    </main>
  );
}
