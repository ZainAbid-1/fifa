import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLeaderboard, checkHealth } from '../api/client';
import './LandingPage.css';

const STATS = [
  { value: '48',  label: 'Nations Competing', accent: 'accent-lime' },
  { value: '104', label: 'Total Matches',      accent: 'accent-red'  },
  { value: '16',  label: 'Host Cities',        accent: 'accent-gold' },
  { value: '3',   label: 'Host Countries',     accent: ''            },
];

const FEATURES = [
  {
    icon: 'squads',
    num: '01',
    title: 'Squad Explorer',
    desc: 'Browse all 48 nation squads with EA FC 26 player ratings, positions, and live injury management.',
    path: '/squads',
    accent: 'cyan',
  },
  {
    icon: 'simulator',
    num: '02',
    title: 'Tournament Simulator',
    desc: 'Step through every stage — Group to Final. Pause, injure players, and watch probabilities shift in real time.',
    path: '/simulator',
    accent: 'pink',
  },
  {
    icon: 'predictor',
    num: '03',
    title: 'Match Predictor',
    desc: 'Head-to-head AI rivalry engine. Compare any two nations and see chaos potential and penalty clutch ratings.',
    path: '/predictor',
    accent: 'gold',
  },
];

const TICKER_ITEMS = [
  'FIFA World Cup 2026', '48 Teams', '104 Matches', 'USA · Canada · Mexico',
  'AI Powered Predictions', '16 Host Cities', 'Run Your Simulation',
  'FIFA World Cup 2026', '48 Teams', '104 Matches', 'USA · Canada · Mexico',
  'AI Powered Predictions', '16 Host Cities', 'Run Your Simulation',
];

const MARQUEE_ITEMS = [
  'Predict', 'Simulate', 'Dominate', 'World Cup 2026',
  'Predict', 'Simulate', 'Dominate', 'World Cup 2026',
];

function FeatureIcon({ name }) {
  if (name === 'squads') return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  if (name === 'simulator') return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  );
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

function FeatureCard({ icon, num, title, desc, path, accent, delay }) {
  const navigate = useNavigate();
  return (
    <div
      className={`feature-card feature-card--${accent} animate-up`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => navigate(path)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(path)}
    >
      <span className="feature-card-number">{num}</span>
      <div className={`feature-icon-wrap feature-icon-wrap--${accent}`}>
        <FeatureIcon name={icon} />
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{desc}</p>
      <div className="feature-arrow">Explore →</div>
    </div>
  );
}

function AnimatedNumber({ target }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const num = parseInt(target, 10);
    if (isNaN(num)) { setDisplay(target); return; }
    let start = null;
    const duration = 1200;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * num));
      if (progress < 1) requestAnimationFrame(step);
      else setDisplay(num);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { requestAnimationFrame(step); observer.disconnect(); }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);
  return <span ref={ref}>{display}</span>;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLB, setLoadingLB] = useState(true);
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    checkHealth()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'));
    getLeaderboard()
      .then(data => setLeaderboard(data.sleepers || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoadingLB(false));
  }, []);

  return (
    <main className="landing">

      {/* ── Ticker Tape ──────────────────────────────────────── */}
      <div className="ticker-tape">
        <div className="ticker-inner">
          {TICKER_ITEMS.map((item, i) => (
            <span key={i} className="ticker-item">{item}</span>
          ))}
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-bg-left" />
          <div className="hero-bg-right" />
          <div className="hero-bg-accent" />
          <div className="hero-stripe" />
          <div className="hero-stripe-2" />
          <div className="hero-pattern" />
        </div>

        <div className="container hero-content">
          {/* Left */}
          <div className="hero-left">
            <div className="hero-badge-row animate-fade">
              <div className="hero-api-badge">
                <span className={`status-dot status-dot--${apiStatus}`} />
                <span>{apiStatus === 'online' ? 'API Online' : apiStatus === 'offline' ? 'API Offline' : 'Connecting…'}</span>
              </div>
            </div>

            <div className="hero-eyebrow animate-up delay-1">
              <div className="hero-eyebrow-line" />
              <span className="hero-label">FIFA World Cup 2026</span>
            </div>

            <h1 className="hero-headline">
              <span className="hero-headline-line1 animate-left delay-2">Predict.</span>
              <span className="hero-headline-line2 animate-left delay-3">Simulate.</span>
              <span className="hero-headline-line3 animate-left delay-4">Dominate.</span>
            </h1>

            <p className="hero-lead animate-up delay-4">
              AI-powered match prediction and full tournament simulation for the
              2026 FIFA World Cup. 48 nations. 104 matches. One champion.
            </p>

            <div className="hero-cta animate-up delay-5">
              <button className="btn btn-primary btn-xl" onClick={() => navigate('/simulator')}>
                Start Simulation
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => navigate('/squads')}>
                View Squads
              </button>
            </div>
          </div>

          {/* Right — Trophy graphic */}
          <div className="hero-right animate-fade delay-3" aria-hidden="true">
            <div className="hero-big-number">26</div>
            <div className="hero-trophy-area">
              <div className="hero-trophy-ring">
                <span className="hero-orbit-dot" />
                <span className="hero-orbit-dot" />
                <span className="hero-orbit-dot" />
                <span className="hero-trophy-emoji">🏆</span>
              </div>
              <span className="hero-trophy-label">FIFA World Cup Trophy</span>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="container">
            <div className="stats-bar-inner">
              {STATS.map(({ value, label, accent }) => (
                <div key={label} className="stats-item">
                  <span className={`stats-value ${accent}`}>
                    <AnimatedNumber target={value} />
                  </span>
                  <span className="stats-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="features-section">
        <div className="container">
          <div className="section-header-row">
            <div>
              <div className="section-tag text-red">
                <div className="section-tag-line" />
                <span className="label">Tools</span>
              </div>
              <h2 className="display-md animate-up">Everything<br />You Need</h2>
            </div>
            <p className="text-muted animate-up delay-2" style={{ maxWidth: 320, fontSize: '0.95rem', lineHeight: 1.7 }}>
              Three powerful tools driven by machine learning and real squad data. Built for the 2026 World Cup.
            </p>
          </div>

          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.path} {...f} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Marquee ───────────────────────────────────────────── */}
      <div className="marquee-strip" aria-hidden="true">
        <div className="marquee-inner">
          {MARQUEE_ITEMS.map((item, i) => (
            <span key={i} className="marquee-item">{item}</span>
          ))}
        </div>
      </div>

      {/* ── Leaderboard ──────────────────────────────────────── */}
      <section className="leaderboard-section">
        <div className="container">
          <div className="leaderboard-grid">

            <div className="leaderboard-left animate-left">
              <div className="section-tag">
                <div className="section-tag-line" />
                <span className="label text-lime">AI Insights</span>
              </div>
              <h2 className="leaderboard-title">Top<br /><span>AI</span><br />Sleepers</h2>
              <p className="leaderboard-desc">
                Teams ranked significantly higher by our model than official FIFA rankings. These are your dark horses.
              </p>
              <button
                className="btn btn-lime btn-lg mt-32"
                onClick={() => navigate('/simulator')}
              >
                Run Simulation
              </button>
            </div>

            <div className="leaderboard-wrap animate-up delay-2">
              <div className="leaderboard-header">
                <h3>Leaderboard</h3>
                <span className="badge badge-lime">Live Data</span>
              </div>

              {loadingLB ? (
                <div className="loading-state">
                  <div className="spinner" />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-sub)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                    Loading…
                  </span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="empty-state" style={{ padding: '48px 28px' }}>
                  <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontSize: '0.9rem' }}>
                    Leaderboard unavailable — run a simulation first.
                  </p>
                  <button className="btn btn-primary btn-sm mt-8" onClick={() => navigate('/simulator')}>
                    Go to Simulator
                  </button>
                </div>
              ) : (
                <div className="lb-table">
                  <div className="lb-row lb-row--head">
                    <span className="lb-cell lb-rank">#</span>
                    <span className="lb-cell lb-team">Team</span>
                    <span className="lb-cell lb-num">AI Rank</span>
                    <span className="lb-cell lb-num">FIFA</span>
                    <span className="lb-cell lb-num">Δ Diff</span>
                    <span className="lb-cell lb-num">Win%</span>
                  </div>
                  {leaderboard.map((row, i) => (
                    <div key={row.team} className="lb-row animate-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <span className="lb-cell lb-rank">
                        <span className={`rank-badge ${i < 3 ? 'rank-badge--top' : ''}`}>{i + 1}</span>
                      </span>
                      <span className="lb-cell lb-team" style={{ color: 'white', fontWeight: 600 }}>
                        {row.team}
                      </span>
                      <span className="lb-cell lb-num text-lime">{row.ai_rank}</span>
                      <span className="lb-cell lb-num">{row.world_ranking}</span>
                      <span className="lb-cell lb-num">
                        <span className="badge-green">+{Math.round(row.value_diff)}</span>
                      </span>
                      <span className="lb-cell lb-num" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {row.p_winner != null ? `${(row.p_winner * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer CTA ────────────────────────────────────────── */}
      <section className="footer-cta">
        <div className="container footer-cta-inner">
          <h2 className="animate-up">Ready to<br />Simulate?</h2>
          <p className="animate-up delay-1">
            Start the AI tournament and see who lifts the trophy in 2026.
          </p>
          <div className="row flex-center mt-24 animate-up delay-2" style={{ gap: 16 }}>
            <button className="btn btn-lime btn-xl" onClick={() => navigate('/simulator')}>
              Run Tournament Simulation
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/predictor')}>
              Match Predictor
            </button>
          </div>
        </div>
      </section>

    </main>
  );
}
