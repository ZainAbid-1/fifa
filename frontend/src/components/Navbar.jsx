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
            <img src="/wc26-logo.jpg" alt="WC26 Logo" style={{ height: '40px', borderRadius: '4px' }} />
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

      </div>
    </nav>
  );
}
