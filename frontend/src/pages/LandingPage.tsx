import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLeaderboard, checkHealth } from '../api/client'
import { Trophy, Users, Swords, Brain, Zap, ChevronRight, Sparkles, TrendingUp } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const STATS = [
  { value: '48', label: 'Nations', suffix: '' },
  { value: '104', label: 'Matches', suffix: '' },
  { value: '16', label: 'Host Cities', suffix: '' },
  { value: '3', label: 'Countries', suffix: '' },
]

const FEATURES = [
  {
    icon: Users,
    title: 'Squad Explorer',
    desc: 'Browse all 48 nation squads with EA FC 26 player ratings, positions, and live injury management.',
    path: '/squads',
    accent: 'cyan' as const,
  },
  {
    icon: Swords,
    title: 'Tournament Simulator',
    desc: 'Step through every stage — Group to Final. Pause, injure players, and watch probabilities shift in real time.',
    path: '/simulator',
    accent: 'magenta' as const,
  },
  {
    icon: Brain,
    title: 'Match Predictor',
    desc: 'Head-to-head AI rivalry engine. Compare any two nations, see chaos potential and penalty clutch ratings.',
    path: '/predictor',
    accent: 'gold' as const,
  },
]

const ACCENT_STYLES = {
  cyan:     { bg: '#00D4FF20', color: '#00D4FF', shadow: '0 8px 40px #00D4FF25', gradient: 'linear-gradient(135deg, #00D4FF, #0099cc)' },
  magenta:  { bg: '#E10B8520', color: '#E10B85', shadow: '0 8px 40px #E10B8525', gradient: 'linear-gradient(135deg, #E10B85, #b0086a)' },
  gold:     { bg: '#F5C51820', color: '#F5C518', shadow: '0 8px 40px #F5C1825', gradient: 'linear-gradient(135deg, #F5C518, #d4a017)' },
}

function AnimatedCounter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const num = parseInt(value)

  useEffect(() => {
    if (!ref.current) return
    const obj = { val: 0 }
    gsap.to(obj, {
      val: num,
      duration: 2,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(obj.val) + suffix
      },
    })
  }, [num, suffix])

  return <span ref={ref} className="stat-value gradient-text">0{suffix}</span>
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [loadingLB, setLoadingLB] = useState(true)
  const [apiStatus, setApiStatus] = useState('checking')

  const statsRef = useRef<HTMLDivElement>(null)
  const lbRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const trophyRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    checkHealth()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))

    getLeaderboard()
      .then(data => setLeaderboard(data.sleepers || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoadingLB(false))
  }, [])

  // GSAP entrance animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero entrance
      gsap.fromTo('.hero-badge',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.3, ease: 'power3.out' }
      )
      gsap.fromTo('.hero-title-line',
        { opacity: 0, y: 60, rotateX: -20 },
        { opacity: 1, y: 0, rotateX: 0, duration: 1, stagger: 0.15, delay: 0.5, ease: 'power3.out' }
      )
      gsap.fromTo('.hero-lead',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, delay: 1, ease: 'power3.out' }
      )
      gsap.fromTo('.hero-cta',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, delay: 1.2, ease: 'power3.out' }
      )

      // Trophy float
      if (trophyRef.current) {
        gsap.to(trophyRef.current, {
          y: -15,
          duration: 3,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      }

      // Stats strip
      if (statsRef.current) {
        gsap.fromTo(statsRef.current,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 0.8, scrollTrigger: { trigger: statsRef.current, start: 'top 85%' } }
        )
      }

      // Feature cards
      gsap.utils.toArray<HTMLElement>('.feature-card-anim').forEach((card, i) => {
        gsap.fromTo(card,
          { opacity: 0, y: 50, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.7, delay: i * 0.15,
            scrollTrigger: { trigger: card, start: 'top 85%' } }
        )
      })

      // Leaderboard
      if (lbRef.current) {
        gsap.fromTo(lbRef.current,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 0.8, scrollTrigger: { trigger: lbRef.current, start: 'top 85%' } }
        )
      }

      // CTA
      if (ctaRef.current) {
        gsap.fromTo(ctaRef.current,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 0.8, scrollTrigger: { trigger: ctaRef.current, start: 'top 85%' } }
        )
      }
    })

    return () => ctx.revert()
  }, [])

  const statusDot = apiStatus === 'online' ? 'bg-[var(--green)] shadow-[0_0_10px_var(--green)]'
    : apiStatus === 'offline' ? 'bg-[var(--red)] shadow-[0_0_10px_var(--red)]'
    : 'bg-[var(--gold)] animate-pulse'

  return (
    <main className="overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════
          HERO SECTION — Video Background + Trophy + Energy
          ═══════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="video-bg"
          src="/hero-bg.mp4"
        />
        <div className="video-bg-overlay" />

        {/* Animated Gradient Orbs */}
        <div className="animated-gradient-bg">
          <div className="gradient-orb gradient-orb--magenta" />
          <div className="gradient-orb gradient-orb--cyan" />
          <div className="gradient-orb gradient-orb--gold" />
        </div>

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 pointer-events-none z-[1] opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(var(--cyan) 1px, transparent 1px), linear-gradient(90deg, var(--cyan) 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className="container relative z-10 pt-24 pb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              <h1 className="display-lg mb-8 font-bold leading-tight">
                <span className="hero-title-line block">FIFA</span>
                <span className="hero-title-line block gradient-text-cyan-magenta">WORLD CUP</span>
                <span className="hero-title-line block text-[var(--gold)]">2026</span>
              </h1>

              <p className="hero-lead text-lg text-[var(--text-muted)] max-w-lg leading-relaxed mb-10">
                Match prediction and full tournament simulation for the
                2026 FIFA World Cup. <span className="text-[var(--cyan)] font-semibold">48 nations.</span>{' '}
                <span className="text-[var(--magenta)] font-semibold">104 matches.</span>{' '}
                <span className="text-[var(--gold)] font-semibold">One champion.</span>
              </p>

              <div className="hero-cta flex gap-4 flex-wrap">
                <button
                  className="btn btn-primary btn-xl group"
                  onClick={() => navigate('/simulator')}
                >
                  <Zap size={20} className="group-hover:rotate-12 transition-transform" />
                  Start Simulation
                </button>
                <button
                  className="btn btn-ghost btn-lg group"
                  onClick={() => navigate('/squads')}
                >
                  View All Squads
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Trophy */}
            <div className="hidden lg:flex justify-center items-center relative">
              <div className="absolute inset-0 bg-[var(--gold)]/5 rounded-full blur-3xl scale-75" />
              <img
                ref={trophyRef}
                src="/trophy-hero.png"
                alt="FIFA World Cup Trophy"
                className="w-auto max-h-[600px] object-contain relative z-10 animate-trophy drop-shadow-2xl"
              />
            </div>
          </div>
        </div>

        {/* Rainbow Arc */}
        <div className="rainbow-arc" style={{ opacity: 0.08 }} />
      </section>

      {/* ═══════════════════════════════════════════════════════
          STATS STRIP — Animated Counters
          ═══════════════════════════════════════════════════════ */}
      <section ref={statsRef} className="relative z-10 -mt-8 pb-16">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-[var(--border)]"
            style={{ background: 'var(--border)' }}>
            {STATS.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 py-8 px-4 transition-all duration-300 hover:bg-[var(--bg-elevated)]"
                style={{ background: 'var(--bg-card)' }}
              >
                <AnimatedCounter value={value} />
                <span className="label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FEATURE CARDS — Hover Effects + Icons
          ═══════════════════════════════════════════════════════ */}
      <section className="section relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 100% 60% at 50% 100%, #E10B8508 0%, transparent 60%)' }} />

        <div className="container relative">
          <div className="text-center max-w-xl mx-auto mb-16">
            <div className="line-accent mx-auto mb-6" />
            <h2 className="display-md mb-4">Everything You Need</h2>
            <p className="text-[var(--text-muted)]">
              Three powerful tools driven by machine learning and real squad data.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const style = ACCENT_STYLES[f.accent]
              const Icon = f.icon
              return (
                <div
                  key={f.path}
                  className="feature-card-anim group cursor-pointer"
                  onClick={() => navigate(f.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate(f.path)}
                  style={{
                    background: 'linear-gradient(145deg, var(--bg-card), #151545)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '36px 32px',
                    transition: 'var(--transition)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = style.color
                    e.currentTarget.style.boxShadow = style.shadow
                    e.currentTarget.style.transform = 'translateY(-6px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: style.bg }}
                  >
                    <Icon size={28} style={{ color: style.color }} />
                  </div>

                  <h3 className="text-xl font-bold font-display tracking-wide uppercase mb-3" style={{ color: style.color }}>
                    {f.title}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-5">
                    {f.desc}
                  </p>

                  <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-8px] group-hover:translate-x-0"
                    style={{ color: style.color }}>
                    Explore <ChevronRight size={14} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          LEADERBOARD — AI Sleepers
          ═══════════════════════════════════════════════════════ */}
      <section className="section relative" ref={lbRef}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 100% 60% at 50% 0%, #E10B8506 0%, transparent 60%)' }} />

        <div className="container relative">
          <div className="card-elevated p-8 md:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp size={18} className="text-[var(--gold)]" />
                  <span className="label text-[var(--gold)]">AI Insights</span>
                </div>
                <h2 className="display-md">Top AI Sleepers</h2>
                <p className="text-[var(--text-muted)] mt-2 max-w-md">
                  Teams ranked higher by our model than FIFA official rankings.
                </p>
              </div>
              <span className="badge badge-gold flex-shrink-0">
                <Zap size={10} className="mr-1" /> Live Data
              </span>
            </div>

            <div className="divider" />

            {loadingLB ? (
              <div className="loading-state py-12">
                <div className="spinner" />
                <span className="text-[var(--text-muted)]">Loading leaderboard...</span>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="empty-state py-12">
                <Trophy size={40} className="text-[var(--gold)] opacity-30 mb-4" />
                <p>Leaderboard unavailable — run a simulation first.</p>
                <button className="btn btn-primary btn-sm mt-6" onClick={() => navigate('/simulator')}>
                  Go to Simulator
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {/* Header */}
                <div className="grid grid-cols-[48px_1fr_90px_90px_110px_80px] items-center px-2 py-3 text-[0.65rem] font-bold tracking-[0.12em] uppercase text-[var(--text-dim)] border-b border-[var(--border)]">
                  <span className="text-center">#</span>
                  <span>Team</span>
                  <span className="text-center">AI Rank</span>
                  <span className="text-center">FIFA Rank</span>
                  <span className="text-center">Difference</span>
                  <span className="text-center">Win %</span>
                </div>

                {leaderboard.map((row, i) => (
                  <div
                    key={row.team}
                    className="grid grid-cols-[48px_1fr_90px_90px_110px_80px] items-center px-2 py-3 rounded-lg transition-all duration-200 hover:bg-[var(--bg-elevated)]"
                  >
                    <span className="text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        i < 3
                          ? 'bg-[var(--gold-dim)] text-[var(--gold)] border border-[#F5C51830]'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                      }`}>
                        {i + 1}
                      </span>
                    </span>
                    <span className="font-semibold text-sm truncate">{row.team}</span>
                    <span className="text-center text-[var(--cyan)] font-bold text-sm">{row.ai_rank}</span>
                    <span className="text-center text-[var(--text-muted)] text-sm">{row.world_ranking}</span>
                    <span className="text-center">
                      <span className="badge badge-green text-xs">+{Math.round(row.value_diff)}</span>
                    </span>
                    <span className="text-center text-sm font-semibold">
                      {row.p_winner != null ? `${(row.p_winner * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER CTA
          ═══════════════════════════════════════════════════════ */}
      <section className="section relative border-t border-[var(--border)]" ref={ctaRef}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 100%, #00D4FF0a 0%, transparent 70%)' }} />

        <div className="container text-center relative">
          <div className="line-accent mx-auto mb-8" />
          <h2 className="display-md mb-4">Ready to Simulate?</h2>
          <p className="text-[var(--text-muted)] mb-10 max-w-md mx-auto">
            Start the AI tournament and see who lifts the trophy.
          </p>
          <button
            className="btn btn-primary btn-xl animate-pulse group"
            onClick={() => navigate('/simulator')}
          >
            <Trophy size={22} className="group-hover:rotate-12 transition-transform" />
            Run Tournament Simulation
          </button>
        </div>

        <div className="rainbow-arc" style={{ opacity: 0.06 }} />
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-[var(--border)] text-center">
        <div className="container">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="/wc26-logo.png" alt="WC26" className="h-8 w-auto opacity-50" />
          </div>
          <p className="text-xs text-[var(--text-dim)]">
            FIFA World Cup 26 Simulator AI — Not affiliated with FIFA. For entertainment only.
          </p>
        </div>
      </footer>
    </main>
  )
}
