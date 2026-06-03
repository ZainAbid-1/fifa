import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLeaderboard, checkHealth } from '../api/client';
import './LandingPage.css';

const CONFEDERATION_COLORS = {
  UEFA:     '#00c9e4',
  CONMEBOL: '#e8007a',
  CAF:      '#f5c518',
  CONCACAF: '#00e676',
  AFC:      '#ff6b35',
  OFC:      '#a78bfa',
  OTHER:    '#6b82a8',
};

const STATS = [
  { value: '48',    label: 'Nations Competing' },
  { value: '104',   label: 'Total Matches'     },
  { value: '16',    label: 'Host Cities'        },
  { value: '3',     label: 'Host Countries'     },
];

const FEATURES = [
  {
    icon: 'squads',
    title: 'Squad Explorer',
    desc: 'Browse all 48 nation squads with EA FC 26 player ratings, positions, and live injury management.',
    path: '/squads',
    accent: 'cyan',
  },
  {
    icon: 'simulator',
    title: 'Tournament Simulator',
    desc: 'Step through every stage — Group to Final. Pause, injure players, and watch probabilities shift in real time.',
    path: '/simulator',
    accent: 'pink',
  },
  {
    icon: 'predictor',
    title: 'Match Predictor',
    desc: 'Head-to-head AI rivalry engine. Compare any two nations, see chaos potential and penalty clutch ratings.',
    path: '/predictor',
    accent: 'gold',
  },
];

function FeatureCard({ icon, title, desc, path, accent, delay }) {
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
      <div className={`feature-icon feature-icon--${accent}`}>
        <FeatureIcon name={icon} />
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{desc}</p>
      <div className={`feature-arrow text-${accent}`}>Explore &rarr;</div>
    </div>
  );
}

function FeatureIcon({ name }) {
  if (name === 'squads') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  if (name === 'simulator') return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  );
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
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
    <main className="landing page">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-orb hero-orb--cyan" />
          <div className="hero-orb hero-orb--pink" />
          <div className="hero-grid" />
        </div>

        <div className="container hero-content">
          <div className="hero-badge animate-up">
            <span className={`status-dot status-dot--${apiStatus}`} />
            <span className="label">
              {apiStatus === 'online' ? 'API Online' : apiStatus === 'offline' ? 'API Offline' : 'Connecting...'}
            </span>
          </div>

          <div className="hero-eyebrow animate-up delay-1">
            <span className="badge badge-cyan">FIFA World Cup 2026</span>
          </div>

          <h1 className="display-xl hero-headline animate-up delay-2">
            <span className="gradient-text">Predict.</span>
            <br />
            <span>Simulate.</span>
            <br />
            <span className="text-pink">Dominate.</span>
          </h1>

          <p className="hero-lead animate-up delay-3">
            AI-powered match prediction and full tournament simulation for the
            2026 FIFA World Cup. 48 nations. 104 matches. One champion.
          </p>

          <div className="hero-cta animate-up delay-4">
            <button className="btn btn-primary btn-xl" onClick={() => navigate('/simulator')}>
              Start Simulation
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/squads')}>
              View All Squads
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="container">
          <div className="stats-strip animate-up" style={{ animationDelay: '500ms' }}>
            {STATS.map(({ value, label }) => (
              <div key={label} className="stats-item">
                <span className="stats-value gradient-text">{value}</span>
                <span className="stats-label label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Cards ─────────────────────────────────── */}
      <section className="section features-section">
        <div className="container">
          <div className="section-header center animate-up">
            <div className="line-cyan" style={{ margin: '0 auto 16px' }} />
            <h2 className="display-md">Everything You Need</h2>
            <p className="text-muted mt-8">
              Three powerful tools driven by machine learning and real squad data.
            </p>
          </div>

          <div className="features-grid mt-32">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.path} {...f} delay={i * 120} />
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Sleepers Leaderboard ───────────────────────── */}
      <section className="section leaderboard-section">
        <div className="container">
          <div className="leaderboard-wrap card-elevated animate-up">
            <div className="leaderboard-header">
              <div>
                <p className="label text-gold mb-8">AI Insights</p>
                <h2 className="display-md">Top AI Sleepers</h2>
                <p className="text-muted mt-8">
                  Teams ranked higher by our model than FIFA official rankings.
                </p>
              </div>
              <span className="badge badge-gold">Live Data</span>
            </div>

            <div className="divider" />

            {loadingLB ? (
              <div className="loading-state">
                <div className="spinner" />
                <span className="text-muted">Loading leaderboard...</span>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="empty-state">
                <p>Leaderboard unavailable — run a simulation first.</p>
                <button
                  className="btn btn-primary btn-sm mt-8"
                  onClick={() => navigate('/simulator')}
                >
                  Go to Simulator
                </button>
              </div>
            ) : (
              <div className="lb-table">
                <div className="lb-row lb-row--head">
                  <span className="lb-cell lb-rank">#</span>
                  <span className="lb-cell lb-team">Team</span>
                  <span className="lb-cell lb-num">AI Rank</span>
                  <span className="lb-cell lb-num">FIFA Rank</span>
                  <span className="lb-cell lb-num">Difference</span>
                  <span className="lb-cell lb-num">Win%</span>
                </div>
                {leaderboard.map((row, i) => (
                  <div key={row.team} className={`lb-row animate-up`} style={{ animationDelay: `${i * 60}ms` }}>
                    <span className="lb-cell lb-rank">
                      <span className={`rank-badge ${i < 3 ? 'rank-badge--top' : ''}`}>{i + 1}</span>
                    </span>
                    <span className="lb-cell lb-team">
                      <strong>{row.team}</strong>
                    </span>
                    <span className="lb-cell lb-num text-cyan">{row.ai_rank}</span>
                    <span className="lb-cell lb-num text-muted">{row.world_ranking}</span>
                    <span className="lb-cell lb-num">
                      <span className="badge badge-green">+{Math.round(row.value_diff)}</span>
                    </span>
                    <span className="lb-cell lb-num">
                      {row.p_winner != null
                        ? `${(row.p_winner * 100).toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ────────────────────────────────────── */}
      <section className="footer-cta section">
        <div className="container center">
          <div className="line-cyan" style={{ margin: '0 auto 20px' }} />
          <h2 className="display-md animate-up">Ready to Simulate?</h2>
          <p className="text-muted mt-12 animate-up delay-1">
            Start the AI tournament and see who lifts the trophy.
          </p>
          <div className="row flex-center mt-24 animate-up delay-2">
            <button className="btn btn-primary btn-xl animate-pulse-glow" onClick={() => navigate('/simulator')}>
              Run Tournament Simulation
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
