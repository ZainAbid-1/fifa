import { useEffect, useState, useMemo, useRef } from 'react'
import { getSquads, injurePlayer, restorePlayer } from '../api/client'
import { Search, X, Shield, Users, HeartPulse } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const CONFEDERATIONS = ['All', 'UEFA', 'CONMEBOL', 'CAF', 'CONCACAF', 'AFC']

const CONF_COLOR: Record<string, string> = {
  UEFA: '#00D4FF', CONMEBOL: '#E10B85', CAF: '#F5C518',
  CONCACAF: '#00E676', AFC: '#FF6B35', OFC: '#A78BFA', OTHER: '#6b82a8',
}

function ratingColor(r: number) {
  if (r >= 85) return '#00E676'
  if (r >= 80) return '#F5C518'
  if (r >= 75) return '#00D4FF'
  return '#6b82a8'
}

/* ════════════════════════════════════════════════════════════
   PITCH VIEW — EA FC Style Formation Display
   ════════════════════════════════════════════════════════════ */
function PitchView({ players, team, onToggleInjury, updating }: {
  players: any[]; team: string; onToggleInjury: (team: string, p: any) => void; updating: string | null
}) {
  const byPos: Record<string, any[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  players.forEach(p => {
    const pos = p.position === 'GK' ? 'GK' : p.position
    if (byPos[pos]) byPos[pos].push(p)
    else byPos.FWD.push(p)
  })

  const starters = [
    ...byPos.GK.slice(0, 1),
    ...byPos.DEF.slice(0, 4),
    ...byPos.MID.slice(0, 3),
    ...byPos.FWD.slice(0, 3),
  ]
  const bench = players.filter(p => !starters.includes(p))

  const rows = [
    { label: 'FWD', players: starters.filter(p => p.position === 'FWD') },
    { label: 'MID', players: starters.filter(p => p.position === 'MID') },
    { label: 'DEF', players: starters.filter(p => p.position === 'DEF') },
    { label: 'GK',  players: starters.filter(p => p.position === 'GK')  },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Pitch */}
      <div className="relative rounded-xl overflow-hidden border-2 border-[#2d6a2d] min-h-[380px]"
        style={{ background: 'linear-gradient(180deg, #1a3d1a 0%, #1f4d20 40%, #1f4d20 60%, #1a3d1a 100%)' }}>

        {/* Pitch Markings */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-white/10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/10" />
          <div className="absolute top-[5%] left-[30%] right-[30%] h-[14%] border border-white/[0.08] border-t-0" />
          <div className="absolute bottom-[5%] left-[30%] right-[30%] h-[14%] border border-white/[0.08] border-b-0" />
        </div>

        {/* Players */}
        <div className="relative z-10 flex flex-col gap-2 h-full p-4">
          {rows.map(({ label, players: rowPlayers }) => (
            <div key={label} className="flex justify-center gap-3 flex-wrap flex-1 items-center">
              {rowPlayers.map(p => (
                <PitchPlayer key={p.name} player={p} onToggle={() => onToggleInjury(team, p)} busy={updating === p.name} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--bg-surface)' }}>
          <p className="label text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Users size={12} /> Bench ({bench.length})
          </p>
          <div className="flex flex-col gap-1">
            {bench.map(p => (
              <BenchPlayer key={p.name} player={p} onToggle={() => onToggleInjury(team, p)} busy={updating === p.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PitchPlayer({ player, onToggle, busy }: { player: any; onToggle: () => void; busy: boolean }) {
  const rc = ratingColor(player.overall)
  return (
    <div
      className={`flex flex-col items-center gap-1 relative group cursor-pointer transition-opacity ${player.injured ? 'opacity-50' : ''}`}
      title={`${player.name} — Click to ${player.injured ? 'restore' : 'injure'}`}
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center relative overflow-hidden transition-transform group-hover:scale-110"
        style={{ background: 'rgba(0,0,0,0.5)', border: `2px solid ${rc}` }}>
        <span className="text-[0.6rem] font-bold text-white/90 tracking-wider">{player.position}</span>
        {player.injured && (
          <div className="absolute inset-0 bg-[var(--red)]/60 flex items-center justify-center">
            <HeartPulse size={14} className="text-white" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-0">
        <span className="text-[0.6rem] font-semibold text-white drop-shadow-lg max-w-[65px] truncate">
          {player.name.split(' ').pop()}
        </span>
        <span className="text-[0.65rem] font-bold font-display" style={{ color: rc }}>{player.overall}</span>
      </div>
      <button
        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[0.5rem] font-bold transition-all ${
          player.injured
            ? 'bg-[var(--green)] text-black opacity-100'
            : 'bg-[var(--red)] text-white opacity-0 group-hover:opacity-100'
        } hover:scale-125`}
        onClick={onToggle}
        disabled={busy}
      >
        {busy ? '...' : player.injured ? 'R' : 'X'}
      </button>
    </div>
  )
}

function BenchPlayer({ player, onToggle, busy }: { player: any; onToggle: () => void; busy: boolean }) {
  const rc = ratingColor(player.overall)
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[var(--bg-elevated)] ${player.injured ? 'opacity-50' : ''}`}>
      <span className="text-[0.65rem] font-bold text-[var(--text-muted)] w-8">{player.position}</span>
      <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
      <span className="text-sm font-bold font-display w-8 text-right" style={{ color: rc }}>{player.overall}</span>
      {player.injured && <span className="badge badge-red text-[0.55rem]">INJ</span>}
      <button
        className={`btn btn-sm !py-1 !px-2 !text-[0.65rem] ${player.injured ? 'btn-primary !bg-[var(--green)] !text-black' : 'btn-secondary'}`}
        onClick={onToggle}
        disabled={busy}
      >
        {busy ? '...' : player.injured ? 'Restore' : 'Injure'}
      </button>
    </div>
  )
}

function RatingBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100)
  const color = label === 'Attack' ? 'magenta' : label === 'Midfield' ? 'cyan' : 'green'
  return (
    <div className="flex items-center gap-3">
      <span className="label w-14">{label}</span>
      <div className="progress-bar flex-1">
        <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold w-8 text-right">{value}</span>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   TEAM CARD
   ════════════════════════════════════════════════════════════ */
function TeamCard({ team, confederation, rating, players, onSelect }: {
  team: string; confederation: string; rating: any; players: any[]; onSelect: (t: string) => void
}) {
  const confColor = CONF_COLOR[confederation] || CONF_COLOR.OTHER
  const injured = players.filter(p => p.injured).length

  return (
    <div
      className="group cursor-pointer rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        background: 'linear-gradient(145deg, var(--bg-card), #151545)',
        border: '1px solid var(--border)',
      }}
      onClick={() => onSelect(team)}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = confColor
        e.currentTarget.style.boxShadow = `0 8px 40px ${confColor}30`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(team)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: `${confColor}30` }}>
        <div className="w-11 h-11 rounded-lg flex items-center justify-center text-sm font-bold font-display tracking-wider"
          style={{ background: `${confColor}20`, color: confColor }}>
          {team.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold tracking-wide truncate">{team}</h3>
          <span className="badge text-[0.6rem] mt-1" style={{ background: `${confColor}18`, color: confColor, border: `1px solid ${confColor}30` }}>
            {confederation}
          </span>
        </div>
        <div className="text-2xl font-bold font-display" style={{ color: ratingColor(Math.round(rating.overall)) }}>
          {Math.round(rating.overall)}
        </div>
      </div>

      {/* Bars */}
      <div className="flex flex-col gap-2 p-4">
        <RatingBar label="Attack" value={Math.round(rating.attack)} />
        <RatingBar label="Midfield" value={Math.round(rating.midfield)} />
        <RatingBar label="Defense" value={Math.round(rating.defense)} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]" style={{ background: 'var(--bg-surface)' }}>
        <span className="label text-[var(--text-muted)]">{players.length} players</span>
        {injured > 0 && <span className="badge badge-red text-[0.6rem]">{injured} injured</span>}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   TEAM MODAL
   ════════════════════════════════════════════════════════════ */
function TeamModal({ teamData, onClose, onToggleInjury, updating }: {
  teamData: any; onClose: () => void; onToggleInjury: (team: string, p: any) => void; updating: string | null
}) {
  const { team, confederation, rating, players } = teamData
  const confColor = CONF_COLOR[confederation] || CONF_COLOR.OTHER
  const injured = players.filter((p: any) => p.injured).length

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(4,4,16,0.88)', backdropFilter: 'blur(12px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl rounded-2xl overflow-hidden animate-up my-8"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-deep)' }}>

        {/* Header */}
        <div className="flex flex-wrap items-start gap-6 p-7 border-b" style={{ borderColor: `${confColor}30` }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="badge" style={{ background: `${confColor}18`, color: confColor, border: `1px solid ${confColor}30` }}>
                <Shield size={10} className="mr-1" /> {confederation}
              </span>
              {injured > 0 && <span className="badge badge-red text-[0.6rem]">{injured} injured</span>}
            </div>
            <h2 className="display-md">{team}</h2>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="text-5xl font-bold font-display" style={{ color: ratingColor(Math.round(rating.overall)) }}>
              {Math.round(rating.overall)}
            </div>
            <span className="label text-[var(--text-muted)]">Overall</span>
          </div>

          <button className="btn btn-ghost btn-sm ml-auto" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-7">
          {/* Stats */}
          <div className="flex gap-10 mb-6">
            <div className="stat-block">
              <span className="stat-value text-[var(--magenta)]">{Math.round(rating.attack)}</span>
              <span className="stat-label">Attack</span>
            </div>
            <div className="stat-block">
              <span className="stat-value text-[var(--cyan)]">{Math.round(rating.midfield)}</span>
              <span className="stat-label">Midfield</span>
            </div>
            <div className="stat-block">
              <span className="stat-value text-[var(--green)]">{Math.round(rating.defense)}</span>
              <span className="stat-label">Defense</span>
            </div>
          </div>

          <div className="divider" />

          <PitchView players={players} team={team} onToggleInjury={onToggleInjury} updating={updating} />
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════ */
export default function SquadsPage() {
  const [squads, setSquads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confFilter, setConfFilter] = useState('All')
  const [selected, setSelected] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getSquads()
      .then(d => {
        setSquads(d.teams || [])
        // Animate cards in
        setTimeout(() => {
          if (gridRef.current) {
            gsap.utils.toArray<HTMLElement>('.squad-card-anim').forEach((card, i) => {
              gsap.fromTo(card,
                { opacity: 0, y: 40, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.5, delay: i * 0.04, ease: 'power2.out' }
              )
            })
          }
        }, 100)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return squads.filter(t => {
      const matchSearch = t.team.toLowerCase().includes(search.toLowerCase())
      const matchConf = confFilter === 'All' || t.confederation === confFilter
      return matchSearch && matchConf
    })
  }, [squads, search, confFilter])

  const selectedData = useMemo(() =>
    selected ? squads.find(t => t.team === selected) : null,
    [selected, squads]
  )

  async function handleToggleInjury(team: string, player: any) {
    setUpdating(player.name)
    try {
      const fn = player.injured ? restorePlayer : injurePlayer
      const res = await fn(team, player.name)
      setSquads(prev => prev.map(t => {
        if (t.team !== team) return t
        return {
          ...t,
          rating: res.new_rating,
          players: t.players.map((p: any) =>
            p.name === player.name ? { ...p, injured: !player.injured } : p
          ),
        }
      }))
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(null)
    }
  }

  return (
    <main className="page pb-20">
      {/* Header */}
      <div className="page-header">
        <div className="container relative">
          <div className="line-accent mx-auto mb-6" />
          <h1 className="display-lg flex items-center justify-center gap-4">
            <Users className="text-[var(--cyan)]" size={36} />
            WC26 Squad Explorer
          </h1>
          <p className="text-[var(--text-muted)] mt-3">
            All 48 nations — EA FC 26 ratings, live injury management
          </p>
        </div>
      </div>

      <div className="container">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-8 animate-up">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              className="input pl-10"
              type="text"
              placeholder="Search nation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {CONFEDERATIONS.map(c => (
              <button
                key={c}
                className={`chip ${confFilter === c ? 'active' : ''}`}
                onClick={() => setConfFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="label text-[var(--text-muted)] ml-auto whitespace-nowrap">
            {filtered.length} teams
          </span>
        </div>

        {/* Grid */}
        <div ref={gridRef} className="pb-16">
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <span className="text-[var(--text-muted)]">Loading all 48 squads...</span>
            </div>
          )}

          {error && (
            <div className="empty-state">
              <p className="text-[var(--red)]">Failed to load squads: {error}</p>
              <p className="text-[var(--text-muted)] mt-2">Ensure the API server is running.</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="empty-state">
              <p>No teams match your search.</p>
            </div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
              {filtered.map(t => (
                <div key={t.team} className="squad-card-anim">
                  <TeamCard {...t} onSelect={setSelected} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedData && (
        <TeamModal
          teamData={selectedData}
          onClose={() => setSelected(null)}
          onToggleInjury={handleToggleInjury}
          updating={updating}
        />
      )}
    </main>
  )
}
