import { NavLink, useLocation } from 'react-router-dom';
import './Navbar.css';

const LINKS = [
  { to: '/',           label: 'Home'       },
  { to: '/squads',     label: 'Squads'     },
  { to: '/simulator',  label: 'Simulator'  },
  { to: '/predictor',  label: 'Predictor'  },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="navbar glass">
      <div className="container navbar-inner">
        {/* Brand */}
        <NavLink to="/" className="navbar-brand">
          <div className="navbar-logo">
            <span className="navbar-logo-year">WC</span>
            <span className="navbar-logo-num">26</span>
          </div>
          <div className="navbar-brand-text">
            <span className="navbar-title">FIFA</span>
            <span className="navbar-sub">Simulator AI</span>
          </div>
        </NavLink>

        {/* Links */}
        <ul className="navbar-links">
          {LINKS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `navbar-link ${isActive ? 'active' : ''}`
                }
                end={to === '/'}
              >
                {label}
                {location.pathname === to && <span className="navbar-link-dot" />}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Right badge */}
        <div className="navbar-right">
          <span className="badge badge-cyan">AI Powered</span>
        </div>
      </div>
    </nav>
  );
}
