import { useEffect, useState, useCallback, useRef } from 'react';
import {
  startTournament, getTournamentState, simulateStage,
  injurePlayer, restorePlayer, getSquads,
  getGroupFixtures, simulateBatch,
} from '../api/client';
import './TournamentSimulator.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS = {
  not_started: 'Not Started',
  group_stage: 'Group Stage',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter Finals',
  sf: 'Semi Finals',
  final: 'Final',
  finished: 'Finished',
};

const STAGE_ORDER = ['group_stage', 'r32', 'r16', 'qf', 'sf', 'final', 'finished'];

// WC 2026 date → stage mapping (approximate)
const DATE_TO_STAGE = {
  group_stage: { start: '2026-06-11', end: '2026-07-02' },
  r32: { start: '2026-07-03', end: '2026-07-06' },
  r16: { start: '2026-07-07', end: '2026-07-10' },
  qf: { start: '2026-07-11', end: '2026-07-14' },
  sf: { start: '2026-07-15', end: '2026-07-18' },
  final: { start: '2026-07-19', end: '2026-07-20' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function parseDate(s) {
  return new Date(s + 'T00:00:00');
}

function stagesInRange(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  return Object.entries(DATE_TO_STAGE)
    .filter(([, range]) => {
      const rs = parseDate(range.start);
      const re = parseDate(range.end);
      return rs <= e && re >= s;
    })
    .map(([stage]) => stage);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StagePip({ stage, current }) {
  const idx = STAGE_ORDER.indexOf(stage);
  const curIdx = STAGE_ORDER.indexOf(current);
  const done = curIdx > idx;
  const active = curIdx === idx;
  return (
    <div className={`mm-pip ${done ? 'mm-pip--done' : ''} ${active ? 'mm-pip--active' : ''}`}>
      <div className="mm-pip-dot" />
      <span className="mm-pip-label">{STAGE_LABELS[stage]}</span>
    </div>
  );
}

function MatchCard({ match, small }) {
  const homeWon = match.winner === match.home;
  const awayWon = match.winner === match.away;
  return (
    <div className={`mm-match ${small ? 'mm-match--small' : ''} ${!match.played ? 'mm-match--pending' : ''}`}>
      {match.group && <span className="mm-match-group">Grp {match.group}</span>}
      <div className="mm-match-row">
        <span className={`mm-match-team ${homeWon ? 'mm-match-team--win' : ''}`}>{match.home}</span>
        <div className="mm-match-score">
          {match.played ? (
            <>
              <span className={homeWon ? 'sc-win' : ''}>{match.home_goals}</span>
              <span className="sc-sep">–</span>
              <span className={awayWon ? 'sc-win' : ''}>{match.away_goals}</span>
            </>
          ) : (
            <span className="sc-vs">vs</span>
          )}
        </div>
        <span className={`mm-match-team mm-match-team--away ${awayWon ? 'mm-match-team--win' : ''}`}>{match.away}</span>
      </div>
      {match.played && match.win_reason && match.win_reason !== '90m' && (
        <div className="mm-match-meta">
          {match.extra_time && <span className="mm-badge mm-badge--dark">AET</span>}
          {match.penalties && <span className="mm-badge mm-badge--gold">Pens {match.pen_home_score}–{match.pen_away_score}</span>}
        </div>
      )}
      {match.venue && !small && <div className="mm-match-venue">{match.venue}</div>}
    </div>
  );
}

function StandingsTable({ group, rows }) {
  return (
    <div className="mm-standings-group">
      <div className="mm-standings-title">
        <span className="mm-badge mm-badge--blue">Group {group}</span>
      </div>
      <div className="mm-standings-table">
        <div className="mm-standings-head">
          <span className="st-team">Team</span>
          {['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map(h => (
            <span key={h} className="st-num">{h}</span>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={r.team} className={`mm-standings-row ${i < 2 ? 'mm-standings-row--q' : i === 2 ? 'mm-standings-row--t' : ''}`}>
            <span className="st-team">
              <span className="st-pos">{i + 1}</span>
              {r.team}
            </span>
            <span className="st-num">{r.played}</span>
            <span className="st-num">{r.won}</span>
            <span className="st-num">{r.drawn}</span>
            <span className="st-num">{r.lost}</span>
            <span className="st-num">{r.gf}</span>
            <span className="st-num">{r.ga}</span>
            <span className="st-num">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
            <span className="st-num st-num--pts">{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InjuryManager({ squads, onToggle, busy }) {
  const [team, setTeam] = useState('');
  const [search, setSearch] = useState('');
  const teams = squads.map(t => t.team).sort();
  const squad = squads.find(t => t.team === team);
  const players = (squad?.players || []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mm-injury-manager">
      <h3 className="mm-section-title">Injury Manager</h3>
      <p className="mm-muted mm-injury-hint">
        Mark players as injured before simulating — this reduces team ratings and affects outcomes.
      </p>
      <select className="mm-select" value={team} onChange={e => { setTeam(e.target.value); setSearch(''); }}>
        <option value="">Select a team…</option>
        {teams.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {squad && (
        <>
          <input
            className="mm-input mm-mt-12"
            placeholder="Search player…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {squad.rating !== undefined && (
            <div className="mm-rating-bar">
              <span className="mm-muted" style={{ fontSize: '0.75rem' }}>Team Rating</span>
              <div className="mm-rating-track">
                <div className="mm-rating-fill" style={{ width: `${squad.rating}%` }} />
              </div>
              <span className="mm-rating-value">{squad.rating}</span>
            </div>
          )}
          <div className="mm-player-list">
            {players.map(p => (
              <div key={p.name} className={`mm-player-row ${p.injured ? 'mm-player-row--inj' : ''}`}>
                <span className="mm-player-pos">{p.position}</span>
                <span className="mm-player-name">{p.name}</span>
                <span className="mm-player-rating">{p.overall}</span>
                {p.injured && <span className="mm-badge mm-badge--red" style={{ fontSize: '0.62rem' }}>INJ</span>}
                <button
                  className={`mm-btn mm-btn--sm ${p.injured ? 'mm-btn--lime' : 'mm-btn--ghost'}`}
                  onClick={() => onToggle(team, p)}
                  disabled={busy === p.name}
                >
                  {busy === p.name ? '…' : p.injured ? 'Restore' : 'Injure'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Calendar Control Center ──────────────────────────────────────────────────

function CalendarControl({ onAdvance, busy, currentStage }) {
  const defaultStart = '2026-06-11';
  const defaultEnd = '2026-06-14';
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const stages = stagesInRange(start, end);

  return (
    <div className="mm-calendar-card">
      <div className="mm-calendar-header">
        <div className="mm-calendar-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="16" y1="2" x2="16" y2="6" />
          </svg>
        </div>
        <div>
          <h3 className="mm-calendar-title">Advance Calendar</h3>
          <p className="mm-muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
            Select a date range to simulate all matches within that window.
          </p>
        </div>
      </div>

      <div className="mm-calendar-fields">
        <label className="mm-field-label">
          <span>Start Date</span>
          <input
            type="date"
            className="mm-date-input"
            value={start}
            min="2026-06-11"
            max="2026-07-20"
            onChange={e => setStart(e.target.value)}
          />
        </label>
        <div className="mm-calendar-arrow">→</div>
        <label className="mm-field-label">
          <span>End Date</span>
          <input
            type="date"
            className="mm-date-input"
            value={end}
            min={start}
            max="2026-07-20"
            onChange={e => setEnd(e.target.value)}
          />
        </label>
      </div>

      {stages.length > 0 && (
        <div className="mm-stage-tags">
          {stages.map(s => (
            <span key={s} className="mm-stage-tag">{STAGE_LABELS[s]}</span>
          ))}
        </div>
      )}

      <button
        className="mm-btn mm-btn--advance"
        onClick={() => onAdvance(start, end, stages)}
        disabled={busy || stages.length === 0}
      >
        {busy ? (
          <>
            <span className="mm-spinner" />
            Simulating…
          </>
        ) : (
          <>
            <span className="mm-advance-arrow">→</span>
            ADVANCE TO DATE
          </>
        )}
      </button>

      {stages.length === 0 && (
        <p className="mm-muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
          No tournament stages fall in this window.
        </p>
      )}
    </div>
  );
}

// ─── Cinematic Overlay ────────────────────────────────────────────────────────

const PHASES = {
  CALCULATING: 'calculating',
  REVEAL: 'reveal',
  STATS: 'stats',
  EXIT: 'exit',
};

function CinematicOverlay({ queue, onPause, onComplete }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState(PHASES.CALCULATING);
  const [result, setResult] = useState(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const pausedRef = useRef(false);
  const completedRef = useRef(false);

  const currentMatch = queue[idx] || null;

  // Run simulation for current match
  useEffect(() => {
    if (!currentMatch || paused) return;
    if (done) return;

    let cancelled = false;
    setPhase(PHASES.CALCULATING);
    setResult(null);

    async function run() {
      // Calculating phase — 1.2s minimum for drama
      const calcStart = Date.now();

      let simResult = null;
      try {
        const payload = [{ home: currentMatch.home, away: currentMatch.away, venue: currentMatch.venue || '' }];
        const data = await simulateBatch(payload, 5000);
        simResult = data?.results?.[0] || null;
      } catch (e) {
        console.error('simulateBatch error', e);
      }

      const elapsed = Date.now() - calcStart;
      const wait = Math.max(0, 1400 - elapsed);
      await new Promise(r => setTimeout(r, wait));

      if (cancelled || pausedRef.current) return;

      setResult(simResult);
      setPhase(PHASES.REVEAL);
      await new Promise(r => setTimeout(r, 1000));

      if (cancelled || pausedRef.current) return;
      setPhase(PHASES.STATS);
      await new Promise(r => setTimeout(r, 3200));

      if (cancelled || pausedRef.current) return;
      setPhase(PHASES.EXIT);
      await new Promise(r => setTimeout(r, 400));

      if (cancelled || pausedRef.current) return;

      const nextIdx = idx + 1;
      if (nextIdx >= queue.length) {
        if (!completedRef.current) {
          completedRef.current = true;
          setDone(true);
          onComplete();
        }
      } else {
        setIdx(nextIdx);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [idx, paused, done]);

  function handlePause() {
    pausedRef.current = true;
    setPaused(true);
    onPause();
  }

  if (!currentMatch) return null;

  const homeProb = result?.home_win_pct ?? 40;
  const drawProb = result?.draw_pct ?? 25;
  const awayProb = result?.away_win_pct ?? 35;
  const score = result?.most_common_score || '?–?';
  const [homeGoals, awayGoals] = score.split('–');

  return (
    <div className={`mm-cinema ${phase === PHASES.EXIT ? 'mm-cinema--exit' : 'mm-cinema--enter'}`}>
      {/* Background pulse rings */}
      <div className="mm-cinema-bg">
        <div className="mm-pulse-ring mm-pulse-ring--1" />
        <div className="mm-pulse-ring mm-pulse-ring--2" />
        <div className="mm-pulse-ring mm-pulse-ring--3" />
      </div>

      {/* Progress dots */}
      <div className="mm-cinema-progress">
        {queue.map((_, i) => (
          <div
            key={i}
            className={`mm-cinema-dot ${i < idx ? 'mm-cinema-dot--done' : i === idx ? 'mm-cinema-dot--active' : ''}`}
          />
        ))}
      </div>

      {/* Pause button */}
      <button className="mm-pause-btn" onClick={handlePause}>
        <span className="mm-pause-icon">⏸</span>
        PAUSE
      </button>

      {/* Match counter */}
      <div className="mm-cinema-counter">
        {idx + 1} / {queue.length}
      </div>

      {/* Main content */}
      <div className={`mm-cinema-content mm-cinema-content--${phase}`}>

        {phase === PHASES.CALCULATING && (
          <div className="mm-calc-phase">
            <div className="mm-calc-rings">
              <div className="mm-calc-ring mm-calc-ring--1" />
              <div className="mm-calc-ring mm-calc-ring--2" />
              <div className="mm-calc-ring mm-calc-ring--3" />
              <div className="mm-calc-core">
                <span>⚽</span>
              </div>
            </div>
            <p className="mm-calc-label">CALCULATING</p>
            <div className="mm-calc-teams">
              <span>{currentMatch.home}</span>
              <span className="mm-calc-vs">VS</span>
              <span>{currentMatch.away}</span>
            </div>
            <p className="mm-calc-sims">Running 5,000 simulations…</p>
          </div>
        )}

        {(phase === PHASES.REVEAL || phase === PHASES.STATS || phase === PHASES.EXIT) && (
          <div className="mm-reveal-phase">
            {/* Nation banners */}
            <div className="mm-nation-banners">
              <div className="mm-nation mm-nation--home">
                <span className="mm-nation-name">{currentMatch.home}</span>
                <div className={`mm-nation-score ${phase !== PHASES.REVEAL ? 'mm-nation-score--visible' : 'mm-nation-score--hidden'}`}>
                  {homeGoals}
                </div>
              </div>

              <div className="mm-vs-divider">
                <div className="mm-vs-line" />
                <span className="mm-vs-text">VS</span>
                <div className="mm-vs-line" />
              </div>

              <div className="mm-nation mm-nation--away">
                <div className={`mm-nation-score ${phase !== PHASES.REVEAL ? 'mm-nation-score--visible' : 'mm-nation-score--hidden'}`}>
                  {awayGoals}
                </div>
                <span className="mm-nation-name">{currentMatch.away}</span>
              </div>
            </div>

            {/* Score explode — big central number */}
            <div className={`mm-score-explode ${phase === PHASES.REVEAL ? 'mm-score-explode--pop' : 'mm-score-explode--settled'}`}>
              <span className="mm-score-home">{homeGoals}</span>
              <span className="mm-score-dash">–</span>
              <span className="mm-score-away">{awayGoals}</span>
            </div>

            {/* Stats bar (win probs) */}
            {(phase === PHASES.STATS || phase === PHASES.EXIT) && (
              <div className={`mm-stats-area ${phase === PHASES.STATS ? 'mm-stats-area--in' : ''}`}>
                <div className="mm-prob-label-row">
                  <span>{currentMatch.home}</span>
                  <span>Draw</span>
                  <span>{currentMatch.away}</span>
                </div>
                <div className="mm-prob-bar">
                  <div className="mm-prob-seg mm-prob-seg--home" style={{ width: `${homeProb}%` }}>
                    <span className="mm-prob-pct">{Math.round(homeProb)}%</span>
                  </div>
                  <div className="mm-prob-seg mm-prob-seg--draw" style={{ width: `${drawProb}%` }}>
                    <span className="mm-prob-pct">{Math.round(drawProb)}%</span>
                  </div>
                  <div className="mm-prob-seg mm-prob-seg--away" style={{ width: `${awayProb}%` }}>
                    <span className="mm-prob-pct">{Math.round(awayProb)}%</span>
                  </div>
                </div>
                <div className="mm-sim-note">Based on 5,000 Monte Carlo simulations</div>
                {currentMatch.venue && (
                  <div className="mm-venue-note">{currentMatch.venue}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TournamentSimulator() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const [squads, setSquads] = useState([]);
  const [injBusy, setInjBusy] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('advance');
  const [cinema, setCinema] = useState(null);   // null | { queue: [] }
  const [allFixtures, setAllFixtures] = useState(null);

  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getTournamentState().catch(() => null),
      getSquads().catch(() => ({ teams: [] })),
      getGroupFixtures().catch(() => null),
    ]).then(([st, sq, fx]) => {
      if (st) setState(st);
      setSquads(sq.teams || []);
      if (fx) setAllFixtures(fx);
    }).finally(() => setLoading(false));
  }, []);

  const refreshState = useCallback(() =>
    getTournamentState().then(setState).catch(console.error), []);

  // ── Start tournament ────────────────────────────────────────────────────────
  async function handleStart() {
    setSimBusy(true); setError(null);
    try {
      await startTournament();
      const [st, fx] = await Promise.all([
        getTournamentState(),
        getGroupFixtures().catch(() => null),
      ]);
      setState(st);
      if (fx) setAllFixtures(fx);
    } catch (e) { setError(e.message); }
    finally { setSimBusy(false); }
  }

  // ── Advance to date range ────────────────────────────────────────────────────
  async function handleAdvance(start, end, stages) {
    setError(null);

    // If tournament not started, auto-start first
    if (!state || state.stage === 'not_started') {
      setSimBusy(true);
      try {
        await startTournament();
        await refreshState();
      } catch (e) { setError(e.message); setSimBusy(false); return; }
      setSimBusy(false);
    }

    // Build queue of matches in the date window
    let queue = [];

    if (allFixtures) {
      // Use group fixtures API data if available
      const startDate = parseDate(start);
      const endDate = parseDate(end);
      queue = (allFixtures.fixtures || allFixtures || []).filter(m => {
        if (!m.date) return stages.includes('group_stage');
        const d = parseDate(m.date);
        return d >= startDate && d <= endDate;
      }).map(m => ({ home: m.home, away: m.away, venue: m.venue || '', date: m.date || '' }));
    }

    // Fallback: build queue from tournament state fixtures
    if (queue.length === 0 && state?.fixtures) {
      stages.forEach(s => {
        const stageMatches = (state.fixtures[s] || []).filter(m => !m.played);
        stageMatches.forEach(m => {
          queue.push({ home: m.home, away: m.away, venue: m.venue || '', id: m.id });
        });
      });
    }

    if (queue.length === 0) {
      setError('No unplayed matches found in this date range. Try advancing the tournament stage first.');
      return;
    }

    // Launch cinematic overlay
    setCinema({ queue });
  }

  // ── Cinema complete ─────────────────────────────────────────────────────────
  async function handleCinemaComplete() {
    setCinema(null);
    // After cinema finishes all matches shown, simulate the actual stage(s) on backend
    setSimBusy(true);
    try {
      // Simulate each pending stage
      const st = await getTournamentState();
      if (st && st.stage !== 'not_started' && st.stage !== 'finished') {
        await simulateStage();
      }
      await refreshState();
    } catch (e) { console.error(e); }
    finally { setSimBusy(false); }
  }

  // ── Cinema pause ────────────────────────────────────────────────────────────
  function handleCinemaPause() {
    setCinema(null);
    refreshState();
  }

  // ── Injury toggle ────────────────────────────────────────────────────────────
  async function handleToggleInjury(team, player) {
    setInjBusy(player.name);
    try {
      const fn = player.injured ? restorePlayer : injurePlayer;
      const res = await fn(team, player.name);
      setSquads(prev => prev.map(t => {
        if (t.team !== team) return t;
        return {
          ...t,
          rating: res.new_rating ?? t.rating,
          players: t.players.map(p =>
            p.name === player.name ? { ...p, injured: !player.injured } : p
          ),
        };
      }));
    } catch (e) { console.error(e); }
    finally { setInjBusy(null); }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const stage = state?.stage || 'not_started';
  const canStart = stage === 'not_started' || stage === 'finished';
  const standings = state?.standings || {};
  const fixtures = state?.fixtures || {};
  const groups = Object.keys(standings).sort();
  const koHistory = ['r32', 'r16', 'qf', 'sf', 'final']
    .flatMap(s => (fixtures[s] || []).filter(m => m.played));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="mm-page">
      {/* Cinematic overlay — rendered above everything */}
      {cinema && (
        <CinematicOverlay
          queue={cinema.queue}
          onPause={handleCinemaPause}
          onComplete={handleCinemaComplete}
        />
      )}

      {/* Page header */}
      <div className="mm-header">
        <div className="mm-header-inner">
          <div className="mm-eyebrow">
            <div className="mm-eyebrow-line" />
            <span>FIFA WORLD CUP 2026</span>
          </div>
          <h1 className="mm-title">Manager <span className="mm-title-accent">Mode</span></h1>
          <p className="mm-subtitle">Control the calendar. Manage your squad. Simulate the world.</p>
        </div>
      </div>

      <div className="mm-container">

        {/* Stage progress track */}
        <div className="mm-progress-card">
          <div className="mm-progress-track">
            {STAGE_ORDER.slice(0, -1).map(s => (
              <StagePip key={s} stage={s} current={stage} />
            ))}
          </div>
          {state?.champion && (
            <div className="mm-champion-banner">
              <span className="mm-eyebrow-small">🏆 World Cup Champion</span>
              <span className="mm-champion-name">{state.champion}</span>
            </div>
          )}
        </div>

        {/* Quick actions row */}
        <div className="mm-quick-actions">
          <button
            className="mm-btn mm-btn--start"
            onClick={handleStart}
            disabled={simBusy || !canStart}
          >
            {simBusy && stage === 'not_started'
              ? <><span className="mm-spinner" /> Starting…</>
              : canStart ? 'New Tournament' : 'Restart'
            }
          </button>
          <div className="mm-stage-chip">
            <span className={`mm-stage-dot mm-stage-dot--${stage === 'finished' ? 'gold' : stage === 'not_started' ? 'off' : 'live'}`} />
            {STAGE_LABELS[stage]}
          </div>
        </div>

        {error && <div className="mm-error">{error}</div>}

        {loading && (
          <div className="mm-loading">
            <span className="mm-spinner mm-spinner--lg" />
            <span>Loading…</span>
          </div>
        )}

        {/* Tab nav */}
        <div className="mm-tabs">
          {[
            { id: 'advance', label: 'Advance' },
            { id: 'groups', label: 'Standings' },
            { id: 'bracket', label: 'Bracket' },
            { id: 'injuries', label: 'Squad' },
          ].map(t => (
            <button
              key={t.id}
              className={`mm-tab ${tab === t.id ? 'mm-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Advance ── */}
        {tab === 'advance' && (
          <div className="mm-tab-pane mm-anim-in">
            <CalendarControl
              onAdvance={handleAdvance}
              busy={simBusy}
              currentStage={stage}
            />

            {stage === 'finished' && (
              <div className="mm-trophy-screen">
                <div className="mm-trophy-glow">
                  <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#c8f000" strokeWidth="1.5">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                  </svg>
                </div>
                <h2 className="mm-champion-hero">{state.champion}</h2>
                <p className="mm-muted">2026 FIFA World Cup Champions</p>
                <button className="mm-btn mm-btn--advance mm-mt-24" onClick={handleStart}>
                  Simulate Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Group Standings ── */}
        {tab === 'groups' && (
          <div className="mm-tab-pane mm-anim-in">
            {groups.length === 0 ? (
              <div className="mm-empty">Simulate the Group Stage to see standings.</div>
            ) : (
              <div className="mm-standings-grid">
                {groups.map(g => (
                  <StandingsTable key={g} group={g} rows={standings[g] || []} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Bracket / KO ── */}
        {tab === 'bracket' && (
          <div className="mm-tab-pane mm-anim-in">
            {/* Current stage upcoming */}
            {stage !== 'not_started' && stage !== 'group_stage' && stage !== 'finished' && (
              <div className="mm-bracket-section">
                <h3 className="mm-section-title">
                  <span className="mm-section-dot" />
                  {STAGE_LABELS[stage]} — Upcoming
                </h3>
                <div className="mm-ko-grid">
                  {(fixtures[stage] || []).map(m => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            )}

            {/* Group stage fixtures */}
            {(stage === 'group_stage') && (
              <div>
                <h3 className="mm-section-title">Group Stage Fixtures</h3>
                <div className="mm-fixtures-grid">
                  {(fixtures.group_stage || []).map(m => <MatchCard key={m.id} match={m} small />)}
                </div>
              </div>
            )}

            {/* KO history */}
            {koHistory.length > 0 && (
              <div>
                <h3 className="mm-section-title mm-mt-32">Results History</h3>
                {['r32', 'r16', 'qf', 'sf', 'final'].map(s => {
                  const played = (fixtures[s] || []).filter(m => m.played);
                  if (!played.length) return null;
                  return (
                    <div key={s} className="mm-bracket-section">
                      <h4 className="mm-section-sub">{STAGE_LABELS[s]}</h4>
                      <div className="mm-ko-grid">
                        {played.map(m => <MatchCard key={m.id} match={m} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {koHistory.length === 0 && stage === 'not_started' && (
              <div className="mm-empty">Start the tournament to see bracket results.</div>
            )}
            {koHistory.length === 0 && stage === 'group_stage' && (
              <div className="mm-empty">Complete the group stage to unlock the knockout bracket.</div>
            )}
          </div>
        )}

        {/* ── Tab: Squad / Injuries ── */}
        {tab === 'injuries' && (
          <div className="mm-tab-pane mm-anim-in">
            <InjuryManager squads={squads} onToggle={handleToggleInjury} busy={injBusy} />
          </div>
        )}

      </div>
    </main>
  );
}