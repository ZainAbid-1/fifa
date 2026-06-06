import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  startTournament, getTournamentState, simulateStage, simulateDay,
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

const DATE_TO_STAGE = {
  group_stage: { start: '2026-06-11', end: '2026-06-27' },
  r32: { start: '2026-06-28', end: '2026-07-03' },
  r16: { start: '2026-07-04', end: '2026-07-07' },
  qf: { start: '2026-07-09', end: '2026-07-11' },
  sf: { start: '2026-07-14', end: '2026-07-15' },
  final: { start: '2026-07-19', end: '2026-07-19' },
};

// Calendar config — June + July 2026
const CALENDAR_MONTHS = [
  { year: 2026, month: 5 },  // June (0-indexed)
  { year: 2026, month: 6 },  // July
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) { return d.toISOString().split('T')[0]; }
function parseDate(s) { return new Date(s + 'T00:00:00'); }
function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function stageForDate(dateStr) {
  const d = parseDate(dateStr);
  for (const [stage, range] of Object.entries(DATE_TO_STAGE)) {
    if (d >= parseDate(range.start) && d <= parseDate(range.end)) return stage;
  }
  return null;
}

/**
 * Build a flat map: dateString → [matchObjects]
 *
 * Priority order:
 *  1. state.fixtures  (all stages) — authoritative (IDs + played flags)
 *  2. allFixtures     — pre-game date metadata only
 *
 * FIX: we now iterate ALL stages in state.fixtures (not just group_stage)
 * so that r32/r16/qf/sf/final fixtures with dates appear on the July calendar.
 */
function buildDateFixtureMap(allFixtures, state) {
  // Step 1: date lookup from allFixtures (these have dates even pre-start)
  const dateLookup = {};
  if (allFixtures) {
    const list = allFixtures.fixtures || allFixtures;
    if (Array.isArray(list)) {
      list.forEach(m => { if (m.date) dateLookup[`${m.home}|${m.away}`] = m.date; });
    }
  }

  const map = {};

  // Step 2: Populate from ALL stages in state.fixtures
  if (state?.fixtures) {
    Object.entries(state.fixtures).forEach(([stageKey, matches]) => {
      (matches || []).forEach(m => {
        // Use date on the fixture (backend must add it), or fall back to lookup
        const dateKey = m.date || dateLookup[`${m.home}|${m.away}`] || null;
        if (!dateKey) return;
        if (!map[dateKey]) map[dateKey] = [];
        // Avoid duplicates
        const already = map[dateKey].some(x => x.id === m.id || (x.home === m.home && x.away === m.away));
        if (!already) {
          map[dateKey].push({
            home: m.home,
            away: m.away,
            venue: m.venue || '',
            stage: stageKey,
            id: m.id,
            played: !!m.played,
          });
        }
      });
    });
  }

  // Step 3: If map is still empty (tournament not started), fall back to allFixtures for display
  if (Object.keys(map).length === 0 && allFixtures) {
    const list = allFixtures.fixtures || allFixtures;
    if (Array.isArray(list)) {
      list.forEach(m => {
        const dateKey = m.date || null;
        if (!dateKey) return;
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push({
          home: m.home,
          away: m.away,
          venue: m.venue || '',
          stage: m.stage || stageForDate(dateKey) || 'group_stage',
          id: m.id || null,
          played: !!m.played,
        });
      });
    }
  }

  return map;
}

/**
 * Build calendar grid for a given year/month.
 * Returns array of 6 rows × 7 cols — each cell: { day, dateStr } or null
 */
function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;   // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  let day = 1 - startDow;
  for (let row = 0; row < 6; row++) {
    const rowCells = [];
    for (let col = 0; col < 7; col++, day++) {
      if (day < 1 || day > daysInMonth) rowCells.push(null);
      else rowCells.push({ day, dateStr: isoDate(year, month, day) });
    }
    cells.push(rowCells);
  }
  return cells;
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

// ─── Bracket Tree ─────────────────────────────────────────────────────────────

function BracketView({ fixtures, stage }) {
  const [activeRound, setActiveRound] = useState('r32');
  const koStages = ['r32', 'r16', 'qf', 'sf', 'final'];

  // FIX: check fixtures[s] exists AND has length > 0 (handles undefined gracefully)
  const availableStages = koStages.filter(s => Array.isArray(fixtures[s]) && fixtures[s].length > 0);

  // Auto-select the deepest available stage so the bracket isn't blank
  useEffect(() => {
    if (availableStages.length > 0 && !availableStages.includes(activeRound)) {
      setActiveRound(availableStages[availableStages.length - 1]);
    }
  }, [availableStages.join(',')]); // eslint-disable-line

  if (availableStages.length === 0) {
    return <div className="mm-empty">Complete the group stage to unlock the bracket.</div>;
  }

  return (
    <div className="mm-bracket-wrapper">
      {/* Mobile stage switcher */}
      <div className="mm-bracket-switcher">
        {availableStages.map(s => (
          <button
            key={s}
            className={`mm-bracket-tab ${activeRound === s ? 'mm-bracket-tab--active' : ''}`}
            onClick={() => setActiveRound(s)}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Desktop: horizontal tree */}
      <div className="mm-bracket-desktop">
        {koStages.map(s => {
          const matches = fixtures[s] || [];
          if (!matches.length) return null;
          return (
            <div key={s} className="mm-bracket-col">
              <div className="mm-bracket-col-label">{STAGE_LABELS[s]}</div>
              <div className="mm-bracket-col-matches">
                {matches.map(m => (
                  <div key={m.id} className="mm-bracket-match">
                    <div className={`mm-bracket-team ${m.winner === m.home ? 'mm-bracket-team--win' : ''}`}>
                      <span className="mm-bracket-team-name">{m.home}</span>
                      {m.played && <span className="mm-bracket-score">{m.home_goals}</span>}
                    </div>
                    <div className={`mm-bracket-team ${m.winner === m.away ? 'mm-bracket-team--win' : ''}`}>
                      <span className="mm-bracket-team-name">{m.away}</span>
                      {m.played && <span className="mm-bracket-score">{m.away_goals}</span>}
                    </div>
                    {!m.played && <div className="mm-bracket-pending">TBD</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: single round view */}
      <div className="mm-bracket-mobile">
        <h4 className="mm-section-sub">{STAGE_LABELS[activeRound]}</h4>
        <div className="mm-ko-grid">
          {(fixtures[activeRound] || []).map(m => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Manager Mode Calendar Grid ───────────────────────────────────────────────

function CalendarGrid({ dateFixtureMap, onSimulateDay, busyDate, currentStage }) {
  const [monthIdx, setMonthIdx] = useState(0);
  const { year, month } = CALENDAR_MONTHS[monthIdx];
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = formatDate(new Date());

  // FIX: Auto-advance to July when the group stage ends (all group dates are in June)
  useEffect(() => {
    if (currentStage && currentStage !== 'group_stage' && currentStage !== 'not_started') {
      setMonthIdx(1); // switch to July for knockout stages
    }
  }, [currentStage]);

  const handleDayClick = (dateStr) => {
    const matches = dateFixtureMap[dateStr];
    if (!matches || matches.length === 0) return;
    onSimulateDay(dateStr);
  };

  return (
    <div className="mm-cal-wrapper">
      {/* Month navigation */}
      <div className="mm-cal-nav">
        <button
          className="mm-cal-nav-btn"
          onClick={() => setMonthIdx(i => Math.max(0, i - 1))}
          disabled={monthIdx === 0}
          aria-label="Previous month"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="mm-cal-month-label">
          <span className="mm-cal-month-name">{MONTH_NAMES[month]}</span>
          <span className="mm-cal-month-year">{year}</span>
        </div>

        <button
          className="mm-cal-nav-btn"
          onClick={() => setMonthIdx(i => Math.min(CALENDAR_MONTHS.length - 1, i + 1))}
          disabled={monthIdx === CALENDAR_MONTHS.length - 1}
          aria-label="Next month"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mm-cal-dow-row">
        {DAY_HEADERS.map(d => (
          <div key={d} className="mm-cal-dow">{d}</div>
        ))}
      </div>

      {/* Calendar body */}
      <div className="mm-cal-grid">
        {grid.map((row, ri) =>
          row.map((cell, ci) => {
            if (!cell) {
              return <div key={`empty-${ri}-${ci}`} className="mm-cal-cell mm-cal-cell--empty" />;
            }

            const { day, dateStr } = cell;
            const matches = dateFixtureMap[dateStr] || [];
            const unplayed = matches.filter(m => !m.played);
            const played = matches.filter(m => m.played);
            const hasMatches = matches.length > 0;
            const isToday = dateStr === today;
            const isBusy = busyDate === dateStr;
            const isSimulated = hasMatches && unplayed.length === 0 && played.length > 0;
            const stage = matches[0]?.stage;

            const anyUnplayedUpTo = hasMatches && Object.keys(dateFixtureMap)
              .filter(d => d <= dateStr)
              .some(d => (dateFixtureMap[d] || []).some(m => !m.played));

            return (
              <button
                key={dateStr}
                className={[
                  'mm-cal-cell',
                  hasMatches ? 'mm-cal-cell--match' : '',
                  isSimulated ? 'mm-cal-cell--done' : '',
                  isToday ? 'mm-cal-cell--today' : '',
                  isBusy ? 'mm-cal-cell--busy' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleDayClick(dateStr)}
                disabled={isBusy || !anyUnplayedUpTo}
                title={hasMatches
                  ? `${matches.length} match${matches.length > 1 ? 'es' : ''} — click to simulate up to this day`
                  : undefined}
              >
                <span className="mm-cal-day-num">{day}</span>

                {isBusy && <div className="mm-cal-busy-ring" />}

                {/* FIX: show ALL matches in a scrollable list — no "+X more" truncation */}
                {hasMatches && !isBusy && (
                  <div className="mm-cal-match-info">
                    {matches.map((m, i) => (
                      <div key={i} className="mm-cal-match-pill">
                        <span className="mm-cal-match-teams">
                          {m.home.length > 3 ? m.home.slice(0, 3) : m.home}
                          <span className="mm-cal-match-vs"> v </span>
                          {m.away.length > 3 ? m.away.slice(0, 3) : m.away}
                        </span>
                        {m.played && (
                          <span className="mm-cal-match-score-inline">
                            {/* We don't have goals here, just show ✓ */}
                            ✓
                          </span>
                        )}
                      </div>
                    ))}
                    {stage && (
                      <div className="mm-cal-stage-label">
                        {STAGE_LABELS[stage] || stage}
                      </div>
                    )}
                  </div>
                )}

                {isSimulated && !isBusy && (
                  <div className="mm-cal-done-check">✓</div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="mm-cal-legend">
        <div className="mm-cal-legend-item">
          <div className="mm-cal-legend-dot mm-cal-legend-dot--match" />
          <span>Match Day</span>
        </div>
        <div className="mm-cal-legend-item">
          <div className="mm-cal-legend-dot mm-cal-legend-dot--done" />
          <span>Simulated</span>
        </div>
        <div className="mm-cal-legend-hint mm-cal-legend-item">
          Click a match day to simulate
        </div>
      </div>
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
  const runningRef = useRef(false);

  const currentMatch = queue[idx] || null;

  // ── FIX: Fast-forward — skip all remaining matches immediately ────────────
  function handleFastForward() {
    pausedRef.current = true;
    runningRef.current = false;
    completedRef.current = true;
    setDone(true);
    onComplete(); // triggers the actual simulate_day call with ALL match IDs
  }

  useEffect(() => {
    if (!currentMatch || paused || done) return;
    if (runningRef.current) return;
    runningRef.current = true;

    let cancelled = false;
    setPhase(PHASES.CALCULATING);
    setResult(null);

    async function run() {
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
      await new Promise(r => setTimeout(r, Math.max(0, 1400 - elapsed)));
      if (cancelled || pausedRef.current) { runningRef.current = false; return; }

      setResult(simResult);
      setPhase(PHASES.REVEAL);
      await new Promise(r => setTimeout(r, 1000));
      if (cancelled || pausedRef.current) { runningRef.current = false; return; }

      setPhase(PHASES.STATS);
      await new Promise(r => setTimeout(r, 3200));
      if (cancelled || pausedRef.current) { runningRef.current = false; return; }

      setPhase(PHASES.EXIT);
      await new Promise(r => setTimeout(r, 400));
      if (cancelled || pausedRef.current) { runningRef.current = false; return; }

      runningRef.current = false;
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
    return () => { cancelled = true; runningRef.current = false; };
  }, [idx, paused, done]); // eslint-disable-line

  function handlePause() {
    pausedRef.current = true;
    setPaused(true);
    onPause();
  }

  if (!currentMatch) return null;

  const homeProb = result ? (result.home_win_pct ?? result.win_pct_home ?? null) * 100 : null;
  const drawProb = result ? (result.draw_pct ?? null) * 100 : null;
  const awayProb = result ? (result.away_win_pct ?? result.win_pct_away ?? null) * 100 : null;
  const hasProbs = homeProb !== null && drawProb !== null && awayProb !== null;

  const score = result?.most_common_score || null;
  const [homeGoals, awayGoals] = score ? score.split(/[-–]/) : ['?', '?'];

  return (
    <div className={`mm-cinema ${phase === PHASES.EXIT ? 'mm-cinema--exit' : 'mm-cinema--enter'}`}>
      {/* Background rings */}
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

      {/* Controls — Pause + Fast Forward */}
      <div className="mm-cinema-controls">
        <button className="mm-pause-btn" onClick={handlePause}>
          <span className="mm-pause-icon">⏸</span>
          <span>PAUSE</span>
        </button>

        {/* FIX: Fast Forward button */}
        <button className="mm-ff-btn" onClick={handleFastForward} title="Skip all remaining matches">
          <span>⏭</span>
          <span>SKIP ALL</span>
        </button>
      </div>

      {/* Counter */}
      <div className="mm-cinema-counter">Match {idx + 1} / {queue.length}</div>

      {/* Content */}
      <div className={`mm-cinema-content mm-cinema-content--${phase}`}>

        {phase === PHASES.CALCULATING && (
          <div className="mm-calc-phase">
            <div className="mm-calc-rings">
              <div className="mm-calc-ring mm-calc-ring--1" />
              <div className="mm-calc-ring mm-calc-ring--2" />
              <div className="mm-calc-ring mm-calc-ring--3" />
              <div className="mm-calc-core"><span>⚽</span></div>
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
            <div className="mm-nation-banners">
              <div className="mm-nation mm-nation--home">
                <span className="mm-nation-name">{currentMatch.home}</span>
                <div className={`mm-nation-score ${phase !== PHASES.REVEAL ? 'mm-nation-score--visible' : 'mm-nation-score--hidden'}`}>
                  {homeGoals}
                </div>
              </div>

              <div className="mm-vs-divider">
                <div className="mm-vs-line" />
                <span className="mm-vs-text">FT</span>
                <div className="mm-vs-line" />
              </div>

              <div className="mm-nation mm-nation--away">
                <div className={`mm-nation-score ${phase !== PHASES.REVEAL ? 'mm-nation-score--visible' : 'mm-nation-score--hidden'}`}>
                  {awayGoals}
                </div>
                <span className="mm-nation-name">{currentMatch.away}</span>
              </div>
            </div>

            {phase === PHASES.REVEAL && (
              <div className="mm-score-explode mm-score-explode--pop">
                <span className="mm-score-home">{homeGoals}</span>
                <span className="mm-score-dash">–</span>
                <span className="mm-score-away">{awayGoals}</span>
              </div>
            )}

            {(phase === PHASES.STATS || phase === PHASES.EXIT) && (
              <div className={`mm-stats-area ${phase === PHASES.STATS ? 'mm-stats-area--in' : ''}`}>
                {hasProbs ? (
                  <>
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
                  </>
                ) : (
                  <div className="mm-sim-note">Probability data unavailable</div>
                )}
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
  const [busyDate, setBusyDate] = useState(null);
  const [squads, setSquads] = useState([]);
  const [injBusy, setInjBusy] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('calendar');
  const [cinema, setCinema] = useState(null);
  const [allFixtures, setAllFixtures] = useState(null);

  // ── Boot ─────────────────────────────────────────────────────────────────────
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

  const refreshState = useCallback(async () => {
    const [st, sq, fx] = await Promise.all([
      getTournamentState().catch(() => null),
      getSquads().catch(() => null),
      getGroupFixtures().catch(() => null),
    ]);
    if (st) setState(st);
    if (sq) setSquads(sq.teams || []);
    if (fx) setAllFixtures(fx);
  }, []);

  // ── Date-fixture map (memoised) ───────────────────────────────────────────────
  const dateFixtureMap = useMemo(
    () => buildDateFixtureMap(allFixtures, state),
    [allFixtures, state]
  );

  // ── Start tournament ─────────────────────────────────────────────────────────
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

  // ── Simulate a single day from calendar click ─────────────────────────────────
  async function handleSimulateDay(dateStr) {
    setError(null);
    setSimBusy(true);

    try {
      if (!state || state.stage === 'not_started') {
        await startTournament();
      }

      const fx = await getGroupFixtures().catch(() => null);
      if (fx) setAllFixtures(fx);
      const fixtureList = fx?.fixtures || [];

      const unplayedUpTo = fixtureList
        .filter(m => m.date && m.id && !m.played && m.date <= dateStr)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (unplayedUpTo.length === 0) {
        await refreshState();
        setSimBusy(false);
        return;
      }

      const queue = unplayedUpTo.map(m => ({
        id: m.id,
        home: m.home,
        away: m.away,
        venue: m.venue || '',
        stage: m.stage || 'group_stage',
      }));

      setSimBusy(false);
      setBusyDate(dateStr);
      setCinema({ queue, date: dateStr });

    } catch (e) {
      setError(e.message || 'Simulation failed');
      setSimBusy(false);
    }
  }

  // ── Cinema complete (normal finish OR fast-forward) ────────────────────────────
  async function handleCinemaComplete() {
    const matchIds = cinema.queue.map(m => m.id).filter(Boolean);
    setCinema(null);
    setBusyDate(null);
    setSimBusy(true);
    try {
      if (matchIds.length > 0) {
        await simulateDay(matchIds);
      }
      await refreshState();
    } catch (e) { console.error(e); }
    finally { setSimBusy(false); }
  }

  function handleCinemaPause() {
    setCinema(null);
    setBusyDate(null);
    setTab('injuries');
    refreshState();
  }

  // ── Injury toggle ─────────────────────────────────────────────────────────────
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

  // ── Derived ───────────────────────────────────────────────────────────────────
  const stage = state?.stage || 'not_started';
  const standings = state?.standings || {};
  const fixtures = state?.fixtures || {};
  const groups = Object.keys(standings).sort();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <main className="mm-page">
      {cinema && (
        <CinematicOverlay
          queue={cinema.queue}
          onPause={handleCinemaPause}
          onComplete={handleCinemaComplete}
        />
      )}

      {/* Header */}
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

        {/* Stage progress */}
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

        {/* Quick actions */}
        <div className="mm-quick-actions">
          <button
            className="mm-btn mm-btn--start"
            onClick={handleStart}
            disabled={simBusy}
          >
            {simBusy && stage === 'not_started'
              ? <><span className="mm-spinner" /> Starting…</>
              : stage === 'not_started' ? 'New Tournament' : 'Restart'
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

        {/* Tabs */}
        <div className="mm-tabs">
          {[
            { id: 'calendar', label: '📅 Calendar' },
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

        {/* ── Calendar ── */}
        {tab === 'calendar' && (
          <div className="mm-tab-pane mm-anim-in">
            {stage === 'finished' ? (
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
                <button className="mm-btn mm-btn--advance mm-mt-24" style={{ maxWidth: 260, margin: '24px auto 0' }} onClick={handleStart}>
                  Simulate Again
                </button>
              </div>
            ) : (
              <>
                <div className="mm-cal-hint">
                  <span className="mm-cal-hint-icon">⚽</span>
                  <span>Click any <strong>match day</strong> to simulate <strong>all matches up to and including that date</strong> through the cinematic overlay.</span>
                </div>
                <CalendarGrid
                  dateFixtureMap={dateFixtureMap}
                  onSimulateDay={handleSimulateDay}
                  busyDate={busyDate}
                  currentStage={stage}
                />
              </>
            )}
          </div>
        )}

        {/* ── Standings ── */}
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

        {/* ── Bracket ── */}
        {tab === 'bracket' && (
          <div className="mm-tab-pane mm-anim-in">
            <BracketView fixtures={fixtures} stage={stage} />
          </div>
        )}

        {/* ── Squad ── */}
        {tab === 'injuries' && (
          <div className="mm-tab-pane mm-anim-in">
            {cinema === null && busyDate === null && (
              <div className="mm-resume-hint">
                <span>💡 After injuring players, switch back to the Calendar tab and click the same match day to simulate with updated ratings.</span>
              </div>
            )}
            <InjuryManager squads={squads} onToggle={handleToggleInjury} busy={injBusy} />
          </div>
        )}

      </div>
    </main>
  );
}