import { useEffect, useState, useMemo } from 'react';
import { getSquads } from '../api/client';
import './SquadsPage.css';

const CONFEDERATIONS = ['All', 'UEFA', 'CONMEBOL', 'CAF', 'CONCACAF', 'AFC'];

const CONF_COLOR = {
  UEFA: '#1a7bff',
  CONMEBOL: '#e5001b',
  CAF: '#f7b500',
  CONCACAF: '#c8f000',
  AFC: '#ff5500',
  OFC: '#8b5cf6',
  OTHER: '#5a6a85',
};

const FLAG_MAP = {
  "France": "fr", "Germany": "de", "Spain": "es", "England": "gb-eng", "Portugal": "pt",
  "Netherlands": "nl", "Belgium": "be", "Croatia": "hr", "Austria": "at", "Czechia": "cz",
  "Serbia": "rs", "Switzerland": "ch", "Denmark": "dk", "Sweden": "se", "Norway": "no",
  "Turkey": "tr", "Scotland": "gb-sct", "Ukraine": "ua", "Bosnia-Herzegovina": "ba", "Slovakia": "sk",
  "Brazil": "br", "Argentina": "ar", "Colombia": "co", "Uruguay": "uy", "Ecuador": "ec",
  "Chile": "cl", "Paraguay": "py", "Bolivia": "bo", "Venezuela": "ve", "Peru": "pe",
  "Morocco": "ma", "Senegal": "sn", "Algeria": "dz", "Egypt": "eg", "Ghana": "gh",
  "Ivory Coast": "ci", "Cameroon": "cm", "Tunisia": "tn", "Nigeria": "ng", "South Africa": "za",
  "DR Congo": "cd", "Cape Verde": "cv",
  "United States": "us", "USA": "us", "Mexico": "mx", "Canada": "ca", "Jamaica": "jm", "Honduras": "hn",
  "El Salvador": "sv", "Costa Rica": "cr", "Haiti": "ht", "Panama": "pa",
  "Trinidad and Tobago": "tt", "Curacao": "cw",
  "Japan": "jp", "South Korea": "kr", "Iran": "ir", "Saudi Arabia": "sa", "Australia": "au",
  "Qatar": "qa", "Iraq": "iq", "Jordan": "jo", "Uzbekistan": "uz", "New Zealand": "nz",
  "Italy": "it", "Wales": "gb-wls", "Mali": "ml"
};

function ratingColor(r) {
  if (r >= 85) return '#c8f000';
  if (r >= 80) return '#f7b500';
  if (r >= 75) return '#1a7bff';
  return '#5a6a85';
}

/* ─── Player Row ─────────────────────────────────────────── */
function PlayerRow({ player }) {
  return (
    <div className="dossier-player-row">
      <span className="dossier-player-name">{player.name}</span>
      <span className="dossier-player-overall">{player.overall}</span>
    </div>
  );
}

/* ─── Position Column ────────────────────────────────────── */
function PositionColumn({ title, players, accentColor }) {
  return (
    <div className="dossier-column">
      <div className="dossier-column-header">
        <span className="dossier-column-title" style={{ color: accentColor || 'var(--lime)' }}>
          {title}
        </span>
        <div className="dossier-column-divider" style={{ background: accentColor || 'var(--lime)' }} />
      </div>
      <div className="dossier-column-list">
        {players.length > 0
          ? players.map(p => <PlayerRow key={p.name} player={p} />)
          : <span className="dossier-empty">—</span>
        }
      </div>
    </div>
  );
}

/* ─── Team Modal (Dossier) ───────────────────────────────── */
function TeamModal({ teamData, onClose }) {
  const { team, confederation, rating, players } = teamData;
  const confColor = CONF_COLOR[confederation] || CONF_COLOR.OTHER;
  const code = FLAG_MAP[team] || 'un';

  const { gks, defs, mids, fwds } = useMemo(() => ({
    gks: players.filter(p => p.position === 'GK'),
    defs: players.filter(p => p.position === 'DEF'),
    mids: players.filter(p => p.position === 'MID'),
    fwds: players.filter(p => p.position === 'FWD'),
  }), [players]);

  return (
    <div
      className="dossier-overlay animate-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="dossier-box animate-up">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="dossier-header">
          <div className="dossier-header-identity">
            <div className="dossier-flag-wrap">
              {code === 'un' ? (
                <div
                  className="dossier-flag-fallback"
                  style={{ background: confColor + '20', color: confColor }}
                >
                  {team.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <img
                  src={`https://flagcdn.com/w320/${code}.png`}
                  alt={team}
                  className="dossier-flag"
                />
              )}
            </div>
            <div className="dossier-header-text">
              <span
                className="dossier-conf-badge"
                style={{ color: confColor, borderColor: confColor + '50' }}
              >
                {confederation}
              </span>
              <h2 className="dossier-team-name">{team}</h2>
            </div>
          </div>

          <div className="dossier-ratings">
            <div className="dossier-rating-block">
              <span className="dossier-rating-val" style={{ color: '#d60d0dff' }}>{Math.round(rating.attack)}</span>
              <span className="dossier-rating-label">ATT</span>
            </div>
            <div className="dossier-rating-sep" />
            <div className="dossier-rating-block">
              <span className="dossier-rating-val" style={{ color: '#00d4ff' }}>{Math.round(rating.midfield)}</span>
              <span className="dossier-rating-label">MID</span>
            </div>
            <div className="dossier-rating-sep" />
            <div className="dossier-rating-block">
              <span className="dossier-rating-val" style={{ color: '#4ade80' }}>{Math.round(rating.defense)}</span>
              <span className="dossier-rating-label">DEF</span>
            </div>
            <div className="dossier-rating-sep" />
            <div className="dossier-rating-block">
              <span
                className="dossier-rating-val"
                style={{ color: ratingColor(rating.overall) }}
              >
                {Math.round(rating.overall)}
              </span>
              <span className="dossier-rating-label">OVR</span>
            </div>
          </div>

          <button className="dossier-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* ── Four-Column Grid ────────────────────────────── */}
        <div className="dossier-body">
          <div className="dossier-grid">
            <PositionColumn title="GOALKEEPERS" players={gks} accentColor="#f7b500" />
            <PositionColumn title="DEFENDERS" players={defs} accentColor="#1a7bff" />
            <PositionColumn title="MIDFIELDERS" players={mids} accentColor="#c8f000" />
            <PositionColumn title="ATTACKERS" players={fwds} accentColor="#ff5500" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Team Card ──────────────────────────────────────────── */
function TeamCard({ team, confederation, rating, players, onSelect }) {
  const confColor = CONF_COLOR[confederation] || CONF_COLOR.OTHER;
  const code = FLAG_MAP[team] || 'un';

  const getStars = (ovr) => {
    if (ovr >= 85) return 5;
    if (ovr >= 80) return 4;
    if (ovr >= 75) return 3;
    if (ovr >= 70) return 2;
    return 1;
  };
  const stars = getStars(rating.overall);

  return (
    <div
      className="fc-card"
      onClick={() => onSelect(team)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(team)}
    >
      <div className="fc-card-inner">
        <div className="fc-card-top">
          <h3 className="fc-team-name">{team}</h3>
        </div>

        <div className="fc-card-middle">
          <div className="fc-flag-wrap">
            {code === 'un' ? (
              <div
                className="fc-flag-fallback"
                style={{ background: confColor + '20', color: confColor }}
              >
                {team.slice(0, 2).toUpperCase()}
              </div>
            ) : (
              <img src={`https://flagcdn.com/w320/${code}.png`} alt={team} className="fc-flag" />
            )}
          </div>
        </div>

        <div className="fc-card-stars">
          {'★'.repeat(stars)}<span style={{ opacity: 0.3 }}>{'★'.repeat(5 - stars)}</span>
        </div>

        <div className="fc-card-bottom">
          <div className="fc-stats-view">
            <div className="fc-stat-col">
              <span className="fc-stat-label">ATT</span>
              <span className="fc-stat-val">{Math.round(rating.attack)}</span>
            </div>
            <div className="fc-stat-col">
              <span className="fc-stat-label">MID</span>
              <span className="fc-stat-val">{Math.round(rating.midfield)}</span>
            </div>
            <div className="fc-stat-col">
              <span className="fc-stat-label">DEF</span>
              <span className="fc-stat-val">{Math.round(rating.defense)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function SquadsPage() {
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [confFilter, setConfFilter] = useState('All');
  const [sortBy, setSortBy] = useState('overall');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getSquads()
      .then(d => setSquads(d.teams || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = squads.filter(t => {
      const matchSearch = t.team.toLowerCase().includes(search.toLowerCase());
      const matchConf = confFilter === 'All' || t.confederation === confFilter;
      return matchSearch && matchConf;
    });

    result.sort((a, b) => {
      if (sortBy === 'overall') return b.rating.overall - a.rating.overall;
      if (sortBy === 'attack') return b.rating.attack - a.rating.attack;
      if (sortBy === 'defense') return b.rating.defense - a.rating.defense;
      if (sortBy === 'midfield') return b.rating.midfield - a.rating.midfield;
      return 0;
    });

    return result;
  }, [squads, search, confFilter, sortBy]);

  const selectedData = useMemo(
    () => selected ? squads.find(t => t.team === selected) : null,
    [selected, squads]
  );

  return (
    <main className="squads-page page">
      {/* Header */}
      <div className="page-header">
        <div className="container page-header-content">
          <div className="section-tag" style={{ color: 'var(--lime)', marginBottom: 16 }}>
            <div className="section-tag-line" style={{ background: 'var(--lime)' }} />
            <span className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>FIFA WC 2026</span>
          </div>
          <h1>Squad <span>Explorer</span></h1>
          <p>All 48 nations — EA FC 26 ratings</p>
        </div>
      </div>

      {/* Controls */}
      <div className="container">
        <div className="fc-controls-wrap animate-up">
          <div className="fc-search-wrap">
            <input
              id="squad-search"
              className="fc-input"
              type="text"
              placeholder="Search nation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="fc-chips-wrap">
            {CONFEDERATIONS.map(c => (
              <button
                key={c}
                className={`fc-chip ${confFilter === c ? 'active' : ''}`}
                onClick={() => setConfFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <select
            className="fc-select"
            style={{ width: 'auto', minWidth: '150px' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="overall">Sort: Overall</option>
            <option value="attack">Sort: Attack</option>
            <option value="midfield">Sort: Midfield</option>
            <option value="defense">Sort: Defense</option>
          </select>
          <span className="fc-teams-count">{filtered.length} teams</span>
        </div>
      </div>

      {/* Grid */}
      <div className="container squads-grid-wrap">
        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            <span className="text-muted">Loading all 48 squads...</span>
          </div>
        )}

        {error && (
          <div className="empty-state">
            <p className="text-red">Failed to load squads: {error}</p>
            <p className="text-muted mt-8">Ensure the API server is running.</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="empty-state">
            <p>No teams match your search.</p>
          </div>
        )}

        {!loading && !error && (
          <div className="squads-grid">
            {filtered.map((t, i) => (
              <div
                key={t.team}
                className="animate-up"
                style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}
              >
                <TeamCard {...t} onSelect={setSelected} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dossier Modal */}
      {selectedData && (
        <TeamModal
          teamData={selectedData}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}