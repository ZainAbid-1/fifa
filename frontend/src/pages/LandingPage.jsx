import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
    desc: 'Head-to-head rivalry engine. Compare any two nations and see chaos potential and penalty clutch ratings.',
    path: '/predictor',
    accent: 'gold',
  },
];

const TICKER_ITEMS = [
  'FIFA World Cup 2026', '48 Teams', '104 Matches', 'USA · Canada · Mexico',
  'Tournament Simulation', '16 Host Cities', 'Run Your Simulation',
  'FIFA World Cup 2026', '48 Teams', '104 Matches', 'USA · Canada · Mexico',
  'Tournament Simulation', '16 Host Cities', 'Run Your Simulation',
];

const MARQUEE_ITEMS = [
  'Predict', 'Simulate', 'Dominate', 'World Cup 2026',
  'Predict', 'Simulate', 'Dominate', 'World Cup 2026',
];

function WorldCupTrophySVG() {
  return (
    <svg
      className="wc-trophy-svg"
      viewBox="0 0 340 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Gold gradient for trophy body */}
        <linearGradient id="goldBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5e27a"/>
          <stop offset="25%" stopColor="#f7c93a"/>
          <stop offset="50%" stopColor="#e8a800"/>
          <stop offset="75%" stopColor="#f7c93a"/>
          <stop offset="100%" stopColor="#c8860a"/>
        </linearGradient>
        {/* Sheen gradient */}
        <linearGradient id="goldSheen" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
          <stop offset="40%" stopColor="rgba(255,255,255,0.0)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.15)"/>
        </linearGradient>
        {/* Dark edge gradient */}
        <linearGradient id="goldEdge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.3)"/>
          <stop offset="15%" stopColor="rgba(0,0,0,0.0)"/>
          <stop offset="85%" stopColor="rgba(0,0,0,0.0)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)"/>
        </linearGradient>
        {/* Glow filter */}
        <filter id="trophyGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        {/* Radial glow behind trophy */}
        <radialGradient id="bgGlow" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="rgba(247,181,0,0.35)"/>
          <stop offset="100%" stopColor="rgba(247,181,0,0)"/>
        </radialGradient>
        {/* Green field at base */}
        <linearGradient id="fieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2d8a3e"/>
          <stop offset="100%" stopColor="#1a5c28"/>
        </linearGradient>
        {/* Marble base */}
        <linearGradient id="marbleBase" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3a3a4a"/>
          <stop offset="50%" stopColor="#22222e"/>
          <stop offset="100%" stopColor="#111118"/>
        </linearGradient>
      </defs>

      {/* Background glow blob */}
      <ellipse cx="170" cy="260" rx="130" ry="160" fill="url(#bgGlow)" opacity="0.8"/>

      {/* === FIELD / PITCH BASE === */}
      <ellipse cx="170" cy="420" rx="135" ry="18" fill="url(#fieldGrad)" opacity="0.9"/>
      {/* pitch lines */}
      <ellipse cx="170" cy="420" rx="105" ry="13" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      <ellipse cx="170" cy="420" rx="55" ry="7" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
      <line x1="170" y1="407" x2="170" y2="433" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>

      {/* === MARBLE PEDESTAL BASE === */}
      <rect x="90" y="392" width="160" height="22" rx="4" fill="url(#marbleBase)"/>
      <rect x="80" y="408" width="180" height="16" rx="3" fill="url(#marbleBase)"/>
      {/* marble shine lines */}
      <line x1="95" y1="396" x2="105" y2="422" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
      <line x1="120" y1="394" x2="130" y2="422" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
      <line x1="155" y1="393" x2="160" y2="422" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>

      {/* === TROPHY STEM / COLUMN === */}
      {/* Lower flare */}
      <path d="M130 392 Q170 385 210 392 L205 355 Q170 348 135 355 Z" fill="url(#goldBody)"/>
      <path d="M130 392 Q170 385 210 392 L205 355 Q170 348 135 355 Z" fill="url(#goldEdge)"/>
      <path d="M130 392 Q170 385 210 392 L205 355 Q170 348 135 355 Z" fill="url(#goldSheen)" opacity="0.5"/>

      {/* Mid stem */}
      <rect x="150" y="305" width="40" height="55" rx="2" fill="url(#goldBody)"/>
      <rect x="150" y="305" width="40" height="55" rx="2" fill="url(#goldEdge)"/>
      <path d="M150 305 L165 305 L162 360 L150 360 Z" fill="url(#goldSheen)" opacity="0.4"/>

      {/* Upper flare (bowl base) */}
      <path d="M135 310 Q170 300 205 310 L210 295 Q170 286 130 295 Z" fill="url(#goldBody)"/>
      <path d="M135 310 Q170 300 205 310 L210 295 Q170 286 130 295 Z" fill="url(#goldSheen)" opacity="0.45"/>

      {/* === HANDLES === */}
      {/* Left handle */}
      <path
        d="M118 255 C90 248 72 235 70 215 C68 195 85 183 105 188 C95 198 92 210 100 218 C108 226 120 228 130 230"
        stroke="url(#goldBody)" strokeWidth="16" fill="none" strokeLinecap="round"
      />
      <path
        d="M118 255 C90 248 72 235 70 215 C68 195 85 183 105 188 C95 198 92 210 100 218 C108 226 120 228 130 230"
        stroke="rgba(255,255,255,0.2)" strokeWidth="5" fill="none" strokeLinecap="round"
      />

      {/* Right handle */}
      <path
        d="M222 255 C250 248 268 235 270 215 C272 195 255 183 235 188 C245 198 248 210 240 218 C232 226 220 228 210 230"
        stroke="url(#goldBody)" strokeWidth="16" fill="none" strokeLinecap="round"
      />
      <path
        d="M222 255 C250 248 268 235 270 215 C272 195 255 183 235 188 C245 198 240 210 240 218 C232 226 220 228 210 230"
        stroke="rgba(255,255,255,0.18)" strokeWidth="5" fill="none" strokeLinecap="round"
      />

      {/* === TROPHY CUP / BOWL === */}
      {/* Outer body */}
      <path
        d="M120 295 C115 270 112 245 118 220 C124 195 140 178 170 175 C200 178 216 195 222 220 C228 245 225 270 220 295 Z"
        fill="url(#goldBody)"
      />
      <path
        d="M120 295 C115 270 112 245 118 220 C124 195 140 178 170 175 C200 178 216 195 222 220 C228 245 225 270 220 295 Z"
        fill="url(#goldEdge)"
      />
      {/* Sheen on cup */}
      <path
        d="M125 290 C122 268 120 246 125 224 C130 204 143 190 162 187 L158 183 C138 186 123 202 118 220 C112 245 115 270 120 295 Z"
        fill="url(#goldSheen)" opacity="0.5"
      />

      {/* === WORLD / GLOBE on trophy === */}
      <circle cx="170" cy="225" r="38" fill="#1a6ca8" opacity="0.9"/>
      {/* continent shapes */}
      <path d="M148 210 C152 205 158 204 162 208 C166 212 164 218 160 222 C156 226 149 224 147 220 C145 216 145 214 148 210Z" fill="#3aaa5c" opacity="0.9"/>
      <path d="M170 200 C175 198 181 200 184 205 C187 210 185 217 181 220 C177 223 172 220 170 216 C168 212 168 204 170 200Z" fill="#3aaa5c" opacity="0.9"/>
      <path d="M155 228 C158 225 163 226 165 230 C167 234 165 238 161 239 C157 240 154 237 154 233 C153 231 153 229 155 228Z" fill="#2d944e" opacity="0.85"/>
      <path d="M175 228 C179 226 184 228 186 233 C188 238 185 242 181 242 C177 242 174 238 174 234 C173 231 173 229 175 228Z" fill="#2d944e" opacity="0.85"/>
      {/* globe grid lines */}
      <circle cx="170" cy="225" r="38" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
      <ellipse cx="170" cy="225" rx="38" ry="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8"/>
      <ellipse cx="170" cy="225" rx="20" ry="38" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8"/>
      <line x1="132" y1="225" x2="208" y2="225" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8"/>
      <line x1="170" y1="187" x2="170" y2="263" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8"/>
      {/* globe sheen */}
      <path d="M148 198 C155 192 166 190 172 193 C162 194 155 200 152 210 C149 206 147 202 148 198Z" fill="rgba(255,255,255,0.3)"/>

      {/* === TOP RIM of cup === */}
      <path d="M118 185 Q170 175 222 185 Q220 178 170 172 Q120 178 118 185Z" fill="url(#goldBody)"/>
      <path d="M118 185 Q170 175 222 185 Q220 178 170 172 Q120 178 118 185Z" fill="rgba(255,255,255,0.2)"/>

      {/* === FLOATING PARTICLES === */}
      <circle cx="60" cy="180" r="3" fill="#f7c93a" opacity="0.7" className="particle p1"/>
      <circle cx="290" cy="200" r="2" fill="#f7c93a" opacity="0.6" className="particle p2"/>
      <circle cx="80" cy="310" r="2.5" fill="#f7c93a" opacity="0.5" className="particle p3"/>
      <circle cx="280" cy="350" r="2" fill="white" opacity="0.4" className="particle p4"/>
      <circle cx="50" cy="250" r="1.5" fill="#C8F000" opacity="0.6" className="particle p5"/>
      <circle cx="300" cy="130" r="2" fill="#C8F000" opacity="0.5" className="particle p6"/>
      <circle cx="250" cy="380" r="1.5" fill="white" opacity="0.35" className="particle p7"/>
      <circle cx="100" cy="130" r="2" fill="#f7c93a" opacity="0.45" className="particle p8"/>

      {/* === SPARKLE STARS === */}
      <g className="sparkle s1" transform="translate(52,155)">
        <line x1="0" y1="-8" x2="0" y2="8" stroke="#f7c93a" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="-8" y1="0" x2="8" y2="0" stroke="#f7c93a" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="-5.5" y1="-5.5" x2="5.5" y2="5.5" stroke="#f7c93a" strokeWidth="0.8" strokeLinecap="round"/>
        <line x1="5.5" y1="-5.5" x2="-5.5" y2="5.5" stroke="#f7c93a" strokeWidth="0.8" strokeLinecap="round"/>
      </g>
      <g className="sparkle s2" transform="translate(295,290)">
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#C8F000" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#C8F000" strokeWidth="1.5" strokeLinecap="round"/>
      </g>
      <g className="sparkle s3" transform="translate(75,360)">
        <line x1="0" y1="-5" x2="0" y2="5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="-5" y1="0" x2="5" y2="0" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      </g>
      <g className="sparkle s4" transform="translate(270,140)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#f7c93a" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#f7c93a" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="-5" y1="-5" x2="5" y2="5" stroke="#f7c93a" strokeWidth="0.8" strokeLinecap="round"/>
        <line x1="5" y1="-5" x2="-5" y2="5" stroke="#f7c93a" strokeWidth="0.8" strokeLinecap="round"/>
      </g>

      {/* Trophy reflection glow on ground */}
      <ellipse cx="170" cy="418" rx="80" ry="8" fill="rgba(247,181,0,0.2)" className="trophy-shadow"/>
    </svg>
  );
}

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
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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

            <h1 className="hero-headline">
              <span className="hero-headline-line1 animate-left delay-2">Predict.</span>
              <span className="hero-headline-line2 animate-left delay-3">Simulate.</span>
              <span className="hero-headline-line3 animate-left delay-4">Dominate.</span>
            </h1>

            <p className="hero-lead animate-up delay-4">
              Match prediction and full tournament simulation for the
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
            <div className="hero-trophy-scene">
              <div className="hero-trophy-glow" />
              <div style={{ transform: `translateY(${scrollY * 0.45}px)`, transition: 'transform 0.05s linear', zIndex: 2, display: 'flex', justifyContent: 'center' }}>
                <img src="/trophy-new.png" alt="FIFA World Cup Trophy" className="wc-trophy-img" />
              </div>
              <span className="hero-trophy-label" style={{ transform: `translateY(${scrollY * 0.2}px)` }}>FIFA World Cup Trophy</span>
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

      {/* ── Footer CTA ────────────────────────────────────────── */}
      <section className="footer-cta">
        <div className="container footer-cta-inner">
          <h2 className="animate-up">Ready to<br />Simulate?</h2>
          <p className="animate-up delay-1">
            Start the tournament and see who lifts the trophy in 2026.
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
