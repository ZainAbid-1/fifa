import { useEffect, useState, useCallback, useRef } from 'react'
import {
  startTournament, getTournamentState, simulateStage,
  injurePlayer, restorePlayer, getSquads,
} from '../api/client'
import { Trophy, Swords, Zap, Table, Users, HeartPulse, ChevronRight, RotateCcw } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const STAGE_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  group_stage: 'Group Stage',
  r32:         'Round of 32',
  r16:         'Round of 16',
  qf:          'Quarter Finals',
  sf:          'Semi Finals',
  final:       'Final',
  finished:    'Finished',
}

const STAGE_ORDER = ['group_stage', 'r32', 'r16', 'qf', 'sf', 'final', 'finished']

/* ── Stage Pip ───────────────────────────────────────────── */
function StagePip({ stage, current }: { stage: string; current: string }) {
  const idx = STAGE_ORDER.indexOf(stage)
  const curIdx = STAGE_ORDER.indexOf(current)
  const done = curIdx > idx
  const active = curIdx === idx
  return (
    <div className={`flex flex-col items-center gap-2 flex-1 relative z-10 ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <div className={`w-5 h-5 rounded-full border-2 transition-all duration-300 ${
        done ? 'bg-[var(--cyan)] border-[var(--cyan)] shadow-[0_0_10px_var(--cyan)]' :
        active ? 'bg-[var(--magenta)] border-[var(--magenta)] shadow-[0_0_14px_var(--magenta)] animate-pulse' :
        'bg-[var(--bg-elevated)] border-[var(--border)]'
      }`} />
      <span className={`text-[0.6rem] font-bold uppercase tracking-wider text-center whitespace-nowrap ${
        done ? 'text-[var(--cyan)]' : active ? 'text-[var(--magenta)]' : 'text-[var(--text-dim)]'
      }`}>
        {STAGE_LABELS[stage]}
      </span>
    </div>
  )
}

/* ── Match Card ──────────────────────────────────────────── */
function MatchCard({ match, small }: { match: any; small?: boolean }) {
  const homeWon = match.winner === match.home
  const awayWon = match.winner === match.away

  return (
    <div className={`rounded-xl transition-all duration-200 ${
      !match.played ? 'opacity-60' : 'hover:border-[var(--cyan)] hover:shadow-[0_0_20px_#00D4FF20]'
    }`}
    style={{
      background: 'linear-gradient(145deg, var(--bg-card), #151545)',
      border: '1px solid var(--border)',
      padding: small ? '10px 14px' : '14px 18px',
    }}>
      {match.group && <span className="label text-[0.6rem] text-[var(--cyan)]">Group {match.group}</span>}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold flex-1 truncate ${homeWon ? 'text-[var(--cyan)] font-bold' : ''}`}>
          {match.home}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0 rounded-md px-3 py-1 font-display text-base font-bold"
          style={{ background: 'var(--bg-surface)' }}>
          {match.played ? (
            <>
              <span className={homeWon ? 'text-[var(--cyan)]' : ''}>{match.home_goals}</span>
              <span className="text-[var(--text-dim)] text-xs">–</span>
              <span className={awayWon ? 'text-[var(--cyan)]' : ''}>{match.away_goals}</span>
            </>
          ) : (
            <span className="text-xs text-[var(--text-dim)]">vs</span>
          )}
        </div>
        <span className={`text-sm font-semibold flex-1 truncate text-right ${awayWon ? 'text-[var(--cyan)] font-bold' : ''}`}>
          {match.away}
        </span>
      </div>
      {match.played && match.win_reason && match.win_reason !== '90m' && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {match.extra_time && <span className="badge badge-muted text-[0.55rem]">AET</span>}
          {match.penalties && (
            <span className="badge badge-gold text-[0.55rem]">Pens {match.pen_home_score}–{match.pen_away_score}</span>
          )}
        </div>
      )}
      {match.venue && !small && <div className="label text-[var(--text-muted)] mt-1 truncate text-[0.6rem]">{match.venue}</div>}
    </div>
  )
}

/* ── Standings Table ─────────────────────────────────────── */
function StandingsTable({ group, rows }: { group: string; rows: any[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="px-4 py-3 border-b border-[var(--border)]" style={{ background: 'var(--bg-surface)' }}>
        <span className="badge badge-cyan text-[0.65rem]">Group {group}</span>
      </div>
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_repeat(8,28px)] gap-1 px-4 py-2 text-[0.6rem] font-bold tracking-wider uppercase text-[var(--text-dim)]">
          <span>Team</span><span className="text-center">P</span><span className="text-center">W</span>
          <span className="text-center">D</span><span className="text-center">L</span>
          <span className="text-center">GF</span><span className="text-center">GA</span>
          <span className="text-center">GD</span><span className="text-center">Pts</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.team}
            className={`grid grid-cols-[1fr_repeat(8,28px)] gap-1 px-4 py-2.5 text-sm border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-elevated)] ${
              i < 2 ? 'border-l-[3px] border-l-[var(--cyan)]' : i === 2 ? 'border-l-[3px] border-l-[var(--gold)]' : ''
            }`}>
            <span className="flex items-center gap-2 truncate">
              <span className="w-5 h-5 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[0.6rem] font-bold text-[var(--text-muted)]">
                {i + 1}
              </span>
              {r.team}
            </span>
            <span className="text-center">{r.played}</span>
            <span className="text-center">{r.won}</span>
            <span className="text-center">{r.drawn}</span>
            <span className="text-center">{r.lost}</span>
            <span className="text-center">{r.gf}</span>
            <span className="text-center">{r.ga}</span>
            <span className="text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
            <span className="text-center font-bold text-[var(--cyan)]">{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Injury Manager ──────────────────────────────────────── */
function InjuryManager({ squads, onToggle, busy }: {
  squads: any[]; onToggle: (team: string, p: any) => void; busy: string | null
}) {
  const [teamFilter, setTeamFilter] = useState('')
  const [search, setSearch] = useState('')

  const teams = squads.map(t => t.team).sort()
  const selectedSquad = squads.find(t => t.team === teamFilter)
  const filteredPlayers = selectedSquad?.players.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ) || []

  return (
    <div className="card p-6">
      <h3 className="display-md mb-2 flex items-center gap-3">
        <HeartPulse size={24} className="text-[var(--red)]" /> Injury Manager
      </h3>
      <p className="text-[var(--text-muted)] text-sm mb-5">
        Mark players as injured before simulating a stage to affect team ratings and outcomes.
      </p>
      <div className="flex flex-col gap-3">
        <select id="injury-team-select" className="input" value={teamFilter}
          onChange={e => { setTeamFilter(e.target.value); setSearch('') }}>
          <option value="">Select a team...</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {selectedSquad && (
          <>
            <input className="input" placeholder="Search player..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-1">
              {filteredPlayers.map((p: any) => (
                <div key={p.name}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg-elevated)] ${p.injured ? 'bg-[var(--red-dim)]' : ''}`}>
                  <span className="label w-9 text-[0.6rem]">{p.position}</span>
                  <span className="flex-1 text-sm truncate">{p.name}</span>
                  <span className="text-sm font-bold font-display text-[var(--text-muted)] w-8 text-right">{p.overall}</span>
                  {p.injured && <span className="badge badge-red text-[0.55rem]">INJ</span>}
                  <button
                    className={`btn btn-sm !py-1 !px-2.5 !text-[0.65rem] ${p.injured ? 'btn-primary !bg-[var(--green)] !text-black' : 'btn-secondary'}`}
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
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════ */
export default function TournamentSimulator() {
  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [simBusy, setSimBusy] = useState(false)
  const [squads, setSquads] = useState<any[]>([])
  const [injBusy, setInjBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('progress')
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getTournamentState().catch(() => null),
      getSquads().catch(() => ({ teams: [] })),
    ]).then(([st, sq]) => {
      if (st) setState(st)
      setSquads(sq.teams || [])
    }).finally(() => setLoading(false))
  }, [])

  const refreshState = useCallback(() =>
    getTournamentState().then(setState).catch(console.error), [])

  async function handleStart() {
    setSimBusy(true); setError(null)
    try {
      await startTournament()
      await refreshState()
    } catch (e: any) { setError(e.message) }
    finally { setSimBusy(false) }
  }

  async function handleSimulateStage() {
    setSimBusy(true); setError(null)
    try {
      await simulateStage()
      await refreshState()
    } catch (e: any) { setError(e.message) }
    finally { setSimBusy(false) }
  }

  async function handleToggleInjury(team: string, player: any) {
    setInjBusy(player.name)
    try {
      const fn = player.injured ? restorePlayer : injurePlayer
      const res = await fn(team, player.name)
      setSquads(prev => prev.map(t => {
        if (t.team !== team) return t
        return {
          ...t, rating: res.new_rating,
          players: t.players.map((p: any) =>
            p.name === player.name ? { ...p, injured: !player.injured } : p
          ),
        }
      }))
    } catch (e) { console.error(e) }
    finally { setInjBusy(null) }
  }

  const stage = state?.stage || 'not_started'
  const canStart = stage === 'not_started' || stage === 'finished'
  const canSimulate = stage !== 'not_started' && stage !== 'finished'

  const fixtures = state?.fixtures || {}
  const standings = state?.standings || {}
  const groups = Object.keys(standings).sort()
  const stageFixtures = stage !== 'not_started' && stage !== 'finished' ? (fixtures[stage] || []) : []
  const koHistory = ['r32','r16','qf','sf','final'].flatMap(s => (fixtures[s] || []).filter((m: any) => m.played))

  // Entrance animation
  useEffect(() => {
    if (progressRef.current) {
      gsap.fromTo(progressRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
      )
    }
  }, [])

  return (
    <main className="page pb-20">
      {/* Header */}
      <div className="page-header pt-16 pb-12">
        <div className="container relative">
          <div className="line-accent mx-auto mb-6" />
          <h1 className="display-lg flex items-center justify-center gap-4">
            <Swords className="text-[var(--gold)]" size={36} />
            Tournament Simulator
          </h1>
          <p className="text-[var(--text-muted)] mt-3 max-w-lg mx-auto">
            Step through every stage. Pause, manage injuries, then simulate.
          </p>
        </div>
      </div>

      <div className="container">
        {/* Stage Progress */}
        <div ref={progressRef} className="card p-6 mb-8 animate-up">
          <div className="flex items-center gap-0 relative mb-4">
            {/* Track line */}
            <div className="absolute top-[9px] left-[5%] right-[5%] h-0.5 bg-[var(--border)] -z-0" />
            {STAGE_ORDER.slice(0, -1).map(s => (
              <StagePip key={s} stage={s} current={stage} />
            ))}
          </div>
          {state?.champion && (
            <div className="flex justify-center mt-12 mb-4">
              <div className="flex flex-col items-center justify-center gap-4 py-8 px-16 rounded-3xl shadow-[0_0_60px_#F5C51830]" style={{ background: 'var(--gold-dim)', border: '2px solid #F5C51840' }}>
                <div className="flex items-center gap-3">
                  <Trophy size={28} className="text-[var(--gold)]" />
                  <span className="label text-[var(--gold)] text-lg tracking-widest">WORLD CUP CHAMPION</span>
                </div>
                <span className="text-6xl md:text-7xl font-bold font-display text-[var(--gold)] leading-none text-center">
                  {state.champion}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-6 mb-10 animate-up delay-1">
          <button
            id="start-tournament-btn"
            className="btn btn-primary btn-lg"
            onClick={handleStart}
            disabled={simBusy || !canStart}
          >
            {simBusy && stage === 'not_started' ? <><div className="spinner spinner-sm" /> Starting...</>
              : canStart ? <><RotateCcw size={16} /> Start New Tournament</>
              : 'Restart Tournament'}
          </button>

          {canSimulate && (
            <button
              id="simulate-stage-btn"
              className="btn btn-secondary btn-lg"
              onClick={handleSimulateStage}
              disabled={simBusy}
            >
              {simBusy ? <><div className="spinner spinner-sm" /> Simulating {STAGE_LABELS[stage]}...</>
                : <><ChevronRight size={16} /> Simulate {STAGE_LABELS[stage]}</>}
            </button>
          )}

          <div className="ml-auto">
            <span className={`badge ${stage === 'finished' ? 'badge-gold' : stage === 'not_started' ? 'badge-muted' : 'badge-cyan'}`}>
              {stage === 'finished' && <Trophy size={10} className="mr-1" />}
              {STAGE_LABELS[stage]}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg text-sm mb-5 animate-in" style={{ background: 'var(--red-dim)', border: '1px solid #FF3D5A40', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        {loading && (
          <div className="loading-state py-12">
            <div className="spinner" />
            <span className="text-[var(--text-muted)]">Loading tournament state...</span>
          </div>
        )}

        {/* Tabs */}
        {state && stage !== 'not_started' && (
          <div className="tab-bar mt-12 mb-10 animate-up delay-2">
            <button className={`tab-btn ${tab === 'progress' ? 'active' : ''}`} onClick={() => setTab('progress')}>
              <Zap size={12} className="mr-1" /> Current
            </button>
            <button className={`tab-btn ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>
              <Table size={12} className="mr-1" /> Groups
            </button>
            <button className={`tab-btn ${tab === 'ko' ? 'active' : ''}`} onClick={() => setTab('ko')}>
              <Swords size={12} className="mr-1" /> KO Results
            </button>
            <button className={`tab-btn ${tab === 'injuries' ? 'active' : ''}`} onClick={() => setTab('injuries')}>
              <HeartPulse size={12} className="mr-1" /> Injuries
            </button>
          </div>
        )}

        {/* Tab: Progress */}
        {tab === 'progress' && state && stage !== 'not_started' && (
          <div className="animate-in">
            {stage === 'group_stage' && fixtures.group_stage?.length > 0 && (
              <div>
                <h3 className="display-md mb-5 flex items-center gap-3">
                  <Users size={20} className="text-[var(--cyan)]" /> Group Stage Fixtures
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {fixtures.group_stage.map((m: any) => <MatchCard key={m.id} match={m} small />)}
                </div>
              </div>
            )}

            {stage !== 'group_stage' && stage !== 'finished' && stageFixtures.length > 0 && (
              <div>
                <h3 className="display-md mb-5">{STAGE_LABELS[stage]} — Upcoming</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                  {stageFixtures.map((m: any) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            )}

            {stage === 'finished' && (
              <div className="flex flex-col items-center py-16 animate-scale">
                <div className="animate-trophy mb-6">
                  <Trophy size={80} className="text-[var(--gold)]" />
                </div>
                <h2 className="display-lg text-[var(--gold)] mb-3">{state.champion}</h2>
                <p className="text-[var(--text-muted)] mb-8">Are your 2026 World Cup Champions</p>
                <button className="btn btn-gold btn-lg" onClick={handleStart}>
                  <RotateCcw size={16} /> Simulate Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: Groups */}
        {tab === 'groups' && (
          <div className="animate-in">
            {groups.length === 0 ? (
              <div className="empty-state py-12">
                <p>Simulate the Group Stage first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
                {groups.map(g => <StandingsTable key={g} group={g} rows={standings[g] || []} />)}
              </div>
            )}
          </div>
        )}

        {/* Tab: KO */}
        {tab === 'ko' && (
          <div className="animate-in">
            {koHistory.length === 0 ? (
              <div className="empty-state py-12"><p>No knockout matches played yet.</p></div>
            ) : (
              ['r32','r16','qf','sf','final'].map(s => {
                const played = (fixtures[s] || []).filter((m: any) => m.played)
                if (!played.length) return null
                return (
                  <div key={s} className="mb-10">
                    <h3 className="display-md mb-4">{STAGE_LABELS[s]}</h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                      {played.map((m: any) => <MatchCard key={m.id} match={m} />)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Tab: Injuries */}
        {tab === 'injuries' && (
          <div className="animate-in">
            <InjuryManager squads={squads} onToggle={handleToggleInjury} busy={injBusy} />
          </div>
        )}
      </div>
    </main>
  )
}
