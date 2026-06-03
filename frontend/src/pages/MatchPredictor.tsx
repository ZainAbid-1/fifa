import { useEffect, useState, useCallback, useRef } from 'react'
import { predictMatch, whatIfPredict, getSquads } from '../api/client'
import { Brain, ArrowRightLeft, MapPin, Zap, AlertTriangle, Mountain, Target, X } from 'lucide-react'

/* ── Probability Bar ─────────────────────────────────────── */
function ProbBar({ labelA, labelB, probA, probB, probD }: {
  labelA: string; labelB: string; probA: number; probB: number; probD: number
}) {
  const pA = Math.round((probA || 0) * 100)
  const pD = Math.round((probD || 0) * 100)
  const pB = Math.round((probB || 0) * 100)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-[0.7rem] font-bold tracking-[0.08em] uppercase">
        <span className="text-[var(--cyan)]">{labelA}</span>
        <span className="text-[var(--text-dim)]">Draw</span>
        <span className="text-[var(--magenta)]">{labelB}</span>
      </div>
      <div className="flex h-10 rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
        <div className="flex items-center justify-center text-xs font-bold text-black/70 transition-all duration-700"
          style={{ width: `${pA}%`, background: 'linear-gradient(135deg, var(--cyan), #0099cc)', minWidth: pA > 0 ? 4 : 0 }}>
          {pA >= 12 && <span>{pA}%</span>}
        </div>
        <div className="flex items-center justify-center text-xs font-bold text-[var(--text-dim)] transition-all duration-700"
          style={{ width: `${pD}%`, background: 'var(--bg-surface)', minWidth: pD > 0 ? 4 : 0 }}>
          {pD >= 8 && <span>{pD}%</span>}
        </div>
        <div className="flex items-center justify-center text-xs font-bold text-black/70 transition-all duration-700"
          style={{ width: `${pB}%`, background: 'linear-gradient(135deg, var(--magenta), #b0086a)', minWidth: pB > 0 ? 4 : 0 }}>
          {pB >= 12 && <span>{pB}%</span>}
        </div>
      </div>
      <div className="flex justify-between text-sm font-bold">
        <span className="text-[var(--cyan)]">{pA}%</span>
        <span className="text-[var(--text-muted)]">{pD}%</span>
        <span className="text-[var(--magenta)]">{pB}%</span>
      </div>
    </div>
  )
}

/* ── Chaos Badge ─────────────────────────────────────────── */
function ChaosBadge({ score, isTrap }: { score: number; isTrap: boolean }) {
  const level = score > 30 ? 'high' : score > 15 ? 'medium' : 'low'
  const colors: Record<string, { badge: string; text: string }> = {
    high:   { badge: 'badge-red', text: 'text-[var(--red)]' },
    medium: { badge: 'badge-gold', text: 'text-[var(--gold)]' },
    low:    { badge: 'badge-green', text: 'text-[var(--green)]' },
  }
  const c = colors[level]
  return (
    <div className="flex items-center flex-wrap gap-3">
      <span className={`badge ${c.badge} flex items-center gap-1`}>
        <AlertTriangle size={10} /> Chaos {level.toUpperCase()} — {score.toFixed(1)}
      </span>
      {isTrap && <span className="badge badge-red">Trap Game</span>}
    </div>
  )
}

/* ── Altitude Block ──────────────────────────────────────── */
function AltitudeBlock({ context }: { context: any }) {
  if (!context?.venue) return null
  const hasPenalty = context.altitude_penalty > 0
  return (
    <div className={`flex flex-col gap-2 p-4 rounded-lg ${hasPenalty ? 'border-l-[3px] border-l-[var(--gold)]' : ''}`}
      style={{ background: 'var(--bg-surface)' }}>
      <div className="flex items-center gap-2">
        <Mountain size={12} className={hasPenalty ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'} />
        <span className="label">{context.venue}</span>
      </div>
      <span className={`text-sm ${hasPenalty ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'}`}>
        {context.impact_message}
      </span>
    </div>
  )
}

/* ── Penalty Block ───────────────────────────────────────── */
function PenaltyBlock({ metrics, teamA, teamB }: { metrics: any; teamA: string; teamB: string }) {
  if (!metrics) return null
  const cfA = metrics.clutch_factor_a
  const cfB = metrics.clutch_factor_b
  return (
    <div>
      <p className="label text-[var(--text-muted)] mb-3 flex items-center gap-2">
        <Target size={12} /> Penalty Shootout Clutch
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold w-28 truncate">{teamA}</span>
          <div className="progress-bar flex-1">
            <div className="progress-fill cyan" style={{ width: `${Math.round(cfA * 100)}%` }} />
          </div>
          <span className="text-sm font-bold font-display text-[var(--cyan)] w-10 text-right">{Math.round(cfA * 100)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold w-28 truncate">{teamB}</span>
          <div className="progress-bar flex-1">
            <div className="progress-fill magenta" style={{ width: `${Math.round(cfB * 100)}%` }} />
          </div>
          <span className="text-sm font-bold font-display text-[var(--magenta)] w-10 text-right">{Math.round(cfB * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

const VENUES = [
  '', 'MetLife Stadium, New York/New Jersey', 'AT&T Stadium, Dallas',
  'SoFi Stadium, Los Angeles', 'Levi\'s Stadium, San Francisco',
  'Arrowhead Stadium, Kansas City', 'Gillette Stadium, Boston',
  'Lincoln Financial Field, Philadelphia', 'Hard Rock Stadium, Miami',
  'Mercedes-Benz Stadium, Atlanta', 'NRG Stadium, Houston',
  'Estadio Azteca, Mexico City', 'BC Place, Vancouver',
]

export default function MatchPredictor() {
  const [teams, setTeams] = useState<string[]>([])
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [venue, setVenue] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'standard' | 'whatif'>('standard')
  const [adjA, setAdjA] = useState({ ea_attack: 0, ea_defense: 0, ea_midfield: 0 })
  const [adjB, setAdjB] = useState({ ea_attack: 0, ea_defense: 0, ea_midfield: 0 })
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getSquads()
      .then(d => setTeams((d.teams || []).map((t: any) => t.team).sort()))
      .catch(() => {})
  }, [])

  function swap() {
    setTeamA(teamB)
    setTeamB(teamA)
    setResult(null)
  }

  const handlePredict = useCallback(async () => {
    if (!teamA || !teamB || teamA === teamB) {
      setError('Please select two different teams.')
      return
    }
    setLoading(true); setError(null); setResult(null)
    try {
      let res
      if (mode === 'whatif') {
        const adjustments: Record<string, any> = {}
        const hasAdjA = Object.values(adjA).some(v => v !== 0)
        const hasAdjB = Object.values(adjB).some(v => v !== 0)
        if (hasAdjA) adjustments[teamA] = adjA
        if (hasAdjB) adjustments[teamB] = adjB
        res = await whatIfPredict(teamA, teamB, venue, adjustments)
      } else {
        res = await predictMatch(teamA, teamB, venue)
      }
      setResult(res)
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [teamA, teamB, venue, mode, adjA, adjB])

  function AdjSlider({ label, stat, adj, setAdj }: {
    label: string; stat: string; adj: any; setAdj: React.Dispatch<React.SetStateAction<any>>
  }) {
    return (
      <div className="flex items-center gap-3">
        <span className="label w-14 text-[0.6rem]">{label}</span>
        <input
          type="range" min="-10" max="10" step="1"
          value={adj[stat]}
          onChange={e => setAdj((prev: any) => ({ ...prev, [stat]: Number(e.target.value) }))}
          className="flex-1 h-1 bg-[var(--border)] rounded-full appearance-none cursor-pointer accent-[var(--magenta)]"
        />
        <span className={`w-8 text-right text-sm font-bold ${adj[stat] > 0 ? 'text-[var(--green)]' : adj[stat] < 0 ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}>
          {adj[stat] > 0 ? `+${adj[stat]}` : adj[stat]}
        </span>
      </div>
    )
  }

  const canPredict = teamA && teamB && teamA !== teamB

  return (
    <main className="page pb-20">
      {/* Header */}
      <div className="page-header">
        <div className="container relative">
          <div className="line-accent mx-auto mb-6" />
          <h1 className="display-lg flex items-center justify-center gap-4">
            <Brain className="text-[var(--magenta)]" size={36} />
            Match Predictor
          </h1>
          <p className="text-[var(--text-muted)] mt-3 max-w-lg mx-auto">
            AI-powered head-to-head rivalry engine with what-if scenario support
          </p>
        </div>
      </div>

      <div className="container">
        <div className="grid lg:grid-cols-[420px_1fr] gap-7 items-start">
          {/* ── Left Panel: Inputs ── */}
          <div className="flex flex-col gap-0 lg:sticky lg:top-[calc(var(--nav-h)+20px)] animate-up">
            {/* Mode Toggle */}
            <div className="tab-bar mb-5">
              <button className={`tab-btn ${mode === 'standard' ? 'active' : ''}`} onClick={() => setMode('standard')}>
                <Zap size={12} className="mr-1" /> Standard
              </button>
              <button className={`tab-btn ${mode === 'whatif' ? 'active' : ''}`} onClick={() => setMode('whatif')}>
                What-If
              </button>
            </div>

            {/* Team Selectors */}
            <div className="card-elevated p-6">
              <div className="flex items-end gap-3">
                <div className="col flex-1 gap-2">
                  <label className="label" htmlFor="team-a-select">Home / Team A</label>
                  <select id="team-a-select" className="input font-semibold" value={teamA}
                    onChange={e => { setTeamA(e.target.value); setResult(null) }}>
                    <option value="">Select team...</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <button className="btn btn-ghost !p-2.5 !w-10 !h-10 flex-shrink-0" onClick={swap} title="Swap teams">
                  <ArrowRightLeft size={16} />
                </button>

                <div className="col flex-1 gap-2">
                  <label className="label" htmlFor="team-b-select">Away / Team B</label>
                  <select id="team-b-select" className="input font-semibold" value={teamB}
                    onChange={e => { setTeamB(e.target.value); setResult(null) }}>
                    <option value="">Select team...</option>
                    {teams.filter(t => t !== teamA).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {teamA && teamB && teamA !== teamB && (
                <div className="flex items-center justify-center gap-4 pt-4 mt-4 border-t border-[var(--border)] animate-in">
                  <span className="font-display text-lg font-bold text-[var(--cyan)]">{teamA}</span>
                  <span className="text-xs font-bold text-[var(--text-dim)] tracking-wider">VS</span>
                  <span className="font-display text-lg font-bold text-[var(--magenta)]">{teamB}</span>
                </div>
              )}
            </div>

            {/* Venue */}
            <div className="col gap-2 mt-5">
              <label className="label flex items-center gap-2" htmlFor="venue-select">
                <MapPin size={10} /> Venue (Optional)
              </label>
              <select id="venue-select" className="input" value={venue} onChange={e => setVenue(e.target.value)}>
                {VENUES.map(v => <option key={v} value={v}>{v || 'Neutral Venue'}</option>)}
              </select>
            </div>

            {/* What-If */}
            {mode === 'whatif' && teamA && teamB && (
              <div className="mt-5 animate-in">
                <p className="label text-[var(--text-muted)] mb-3">Stat Adjustments (EA ratings delta)</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="card p-4">
                    <span className="label text-[var(--cyan)] block mb-3">{teamA || 'Team A'}</span>
                    <div className="flex flex-col gap-3">
                      <AdjSlider label="Attack" stat="ea_attack" adj={adjA} setAdj={setAdjA} />
                      <AdjSlider label="Midfield" stat="ea_midfield" adj={adjA} setAdj={setAdjA} />
                      <AdjSlider label="Defense" stat="ea_defense" adj={adjA} setAdj={setAdjA} />
                    </div>
                  </div>
                  <div className="card p-4">
                    <span className="label text-[var(--magenta)] block mb-3">{teamB || 'Team B'}</span>
                    <div className="flex flex-col gap-3">
                      <AdjSlider label="Attack" stat="ea_attack" adj={adjB} setAdj={setAdjB} />
                      <AdjSlider label="Midfield" stat="ea_midfield" adj={adjB} setAdj={setAdjB} />
                      <AdjSlider label="Defense" stat="ea_defense" adj={adjB} setAdj={setAdjB} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 p-3 rounded-lg text-sm animate-in" style={{ background: 'var(--red-dim)', border: '1px solid #FF3D5A40', color: 'var(--red)' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg mt-5 w-full"
              onClick={handlePredict}
              disabled={loading || !canPredict}
            >
              {loading ? <><div className="spinner spinner-sm" /> Predicting...</> : 'Predict Match'}
            </button>
          </div>

          {/* ── Right Panel: Result ── */}
          <div ref={resultRef} className="min-h-[400px] flex flex-col animate-up delay-2">
            {!result && !loading && (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[320px] rounded-xl border border-dashed border-[var(--border)] text-[var(--text-dim)]">
                <Brain size={56} className="opacity-20 mb-4" />
                <p className="text-[var(--text-muted)]">Select two teams and click Predict</p>
              </div>
            )}

            {loading && (
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <div className="loading-state">
                  <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
                  <span className="text-[var(--text-muted)]">Running AI prediction...</span>
                </div>
              </div>
            )}

            {result && !loading && (
              <div className="flex flex-col gap-4 animate-in">
                {/* Result Header */}
                <div className="card-elevated p-7">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-6">
                    <div className="flex flex-col gap-1">
                      <span className="font-display text-xl font-bold text-[var(--cyan)]">{result.team_a}</span>
                      <span className="text-4xl font-bold font-display">{Math.round((result.win_prob_a || 0) * 100)}%</span>
                      <span className="label text-[var(--text-muted)]">win probability</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 rounded-xl p-4" style={{ background: 'var(--bg-surface)' }}>
                      <span className="text-3xl font-bold font-display text-[var(--text-muted)]">{Math.round((result.draw_prob || 0) * 100)}%</span>
                      <span className="label text-[var(--text-muted)]">draw</span>
                    </div>
                    <div className="flex flex-col gap-1 text-right items-end">
                      <span className="font-display text-xl font-bold text-[var(--magenta)]">{result.team_b}</span>
                      <span className="text-4xl font-bold font-display">{Math.round((result.win_prob_b || 0) * 100)}%</span>
                      <span className="label text-[var(--text-muted)]">win probability</span>
                    </div>
                  </div>

                  <ProbBar
                    labelA={result.team_a}
                    labelB={result.team_b}
                    probA={result.win_prob_a}
                    probB={result.win_prob_b}
                    probD={result.draw_prob}
                  />
                </div>

                {/* Chaos */}
                {result.chaos_potential && (
                  <div className="card p-5">
                    <p className="label text-[var(--text-muted)] mb-3">Chaos Potential</p>
                    <ChaosBadge score={result.chaos_potential.score} isTrap={result.chaos_potential.is_trap_game} />
                  </div>
                )}

                {/* Altitude */}
                {result.context && (
                  <div className="card p-5">
                    <AltitudeBlock context={result.context} />
                  </div>
                )}

                {/* Penalty */}
                {result.penalty_metrics && (
                  <div className="card p-5">
                    <PenaltyBlock metrics={result.penalty_metrics} teamA={result.team_a} teamB={result.team_b} />
                  </div>
                )}

                <button className="btn btn-ghost btn-sm mt-2" onClick={() => setResult(null)}>
                  <X size={14} /> Clear Result
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
