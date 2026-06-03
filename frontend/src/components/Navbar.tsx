import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { Trophy, Users, Brain, Swords } from 'lucide-react'
import gsap from 'gsap'

const LINKS = [
  { to: '/', label: 'Home', icon: Trophy },
  { to: '/squads', label: 'Squads', icon: Users },
  { to: '/simulator', label: 'Simulator', icon: Swords },
  { to: '/predictor', label: 'Predictor', icon: Brain },
]

export default function Navbar() {
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (logoRef.current) {
      gsap.fromTo(logoRef.current,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' }
      )
    }
  }, [])

  return (
    <nav
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'glass shadow-lg shadow-black/30'
          : 'bg-transparent'
      }`}
      style={{ height: 'var(--nav-h)' }}
    >
      <div className="container h-full flex items-center gap-6">
        {/* Brand */}
        <NavLink to="/" className="flex items-center gap-3 flex-shrink-0 group">
          <div ref={logoRef} className="relative">
            <img
              src="/wc26-logo.png"
              alt="WC26"
              className="h-12 w-auto drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
            />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-display text-lg font-semibold tracking-wider text-white">
              SIMULATOR
            </span>
          </div>
        </NavLink>

        {/* Links */}
        <ul className="flex items-center gap-4 flex-1 justify-center">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
               <NavLink
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold tracking-wide uppercase transition-all duration-300 ${
                    isActive
                      ? 'text-white bg-[var(--magenta-dim)] shadow-[0_0_15px_var(--magenta-dim)]'
                      : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-elevated)]'
                  }`
                }
                end={to === '/'}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={16} className={isActive ? 'text-[var(--magenta)]' : ''} />
                    <span className="hidden md:inline font-display tracking-wider">{label}</span>
                    {location.pathname === to && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)]" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Right */}
        <div className="flex-shrink-0">
          {/* Removed AI Powered badge */}
        </div>
      </div>
    </nav>
  )
}
