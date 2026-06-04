import { NavLink } from 'react-router-dom';
import './Navbar.css';

const LINKS = [
  { to: '/',           label: 'Home'       },
  { to: '/squads',     label: 'Squads'     },
  { to: '/simulator',  label: 'Simulator'  },
  { to: '/predictor',  label: 'Predictor'  },
];

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <NavLink to="/" className="navbar-brand">
          <div className="navbar-logo">
            <div className="navbar-logo-block">
              <span className="navbar-logo-year">World Cup</span>
              <span className="navbar-logo-num">26</span>
            </div>
          </div>
          <div className="navbar-brand-text">
            <span className="navbar-title">FIFA</span>
            <span className="navbar-sub">Simulator AI</span>
          </div>
        </NavLink>

        <ul className="navbar-links">
          {LINKS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
                end={to === '/'}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="navbar-right">
          <span className="badge">⚡ AI Powered</span>
        </div>
      </div>
    </nav>
  );
}
