import { useEffect, useState, useMemo } from 'react';
import { getSquads, injurePlayer, restorePlayer } from '../api/client';
import './SquadsPage.css';

const CONFEDERATIONS = ['All', 'UEFA', 'CONMEBOL', 'CAF', 'CONCACAF', 'AFC'];

const CONF_COLOR = {
  UEFA:     '#1a7bff',
  CONMEBOL: '#e5001b',
  CAF:      '#f7b500',
  CONCACAF: '#c8f000',
  AFC:      '#ff5500',
  OFC:      '#8b5cf6',
  OTHER:    '#5a6a85',
};

const POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function ratingColor(r) {
  if (r >= 85) return '#c8f000';
  if (r >= 80) return '#f7b500';
  if (r >= 75) return '#1a7bff';
  return '#5a6a85';
}

function PitchView({ players, team, onToggleInjury, updating }) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach(p => {
    const pos = p.position === 'GK' ? 'GK' : p.position;
    if (byPos[pos]) byPos[pos].push(p);
    else byPos.FWD.push(p);
  });

  const starters = [
    ...byPos.GK.slice(0, 1),
    ...byPos.DEF.slice(0, 4),
    ...byPos.MID.slice(0, 3),
    ...byPos.FWD.slice(0, 3),
  ];
  const bench = players.filter(p => !starters.includes(p));

  const rows = [
    { label: 'FWD', players: starters.filter(p => p.position === 'FWD') },
    { label: 'MID', players: starters.filter(p => p.position === 'MID') },
    { label: 'DEF', players: starters.filter(p => p.position === 'DEF') },
    { label: 'GK',  players: starters.filter(p => p.position === 'GK')  },
  ];

  return (
    <div className="pitch-wrap">
      <div className="pitch">
        <div className="pitch-markings" aria-hidden="true">
          <div className="pitch-center-circle" />
          <div className="pitch-center-line" />
          <div className="pitch-penalty-top" />
          <div className="pitch-penalty-bot" />
        </div>

        <div className="pitch-field">
          {rows.map(({ label, players: rowPlayers }) => (
            <div key={label} className="pitch-row">
              {rowPlayers.map(p => (
                <PitchPlayer
                  key={p.name}
                  player={p}
                  onToggle={() => onToggleInjury(team, p)}
                  busy={updating === p.name}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {bench.length > 0 && (
        <div className="bench-section">
          <p className="label text-muted mb-8">Bench ({bench.length})</p>
          <div className="bench-list">
            {bench.map(p => (
              <BenchPlayer
                key={p.name}
                player={p}
                onToggle={() => onToggleInjury(team, p)}
                busy={updating === p.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PitchPlayer({ player, onToggle, busy }) {
  const rc = ratingColor(player.overall);
  return (
    <div
      className={`pitch-player ${player.injured ? 'pitch-player--injured' : ''}`}
      title={`${player.name} — Click to ${player.injured ? 'restore' : 'injure'}`}
    >
      <div className="pitch-player-avatar" style={{ borderColor: rc }}>
        <span className="pitch-player-pos">{player.position}</span>
        {player.injured && <div className="pitch-player-injury-overlay">INJ</div>}
      </div>
      <div className="pitch-player-info">
        <span className="pitch-player-name">{player.name.split(' ').pop()}</span>
        <span className="pitch-player-rating" style={{ color: rc }}>{player.overall}</span>
      </div>
      <button
        className={`pitch-player-action ${player.injured ? 'restore' : 'injure'}`}
        onClick={onToggle}
        disabled={busy}
        title={player.injured ? 'Restore Player' : 'Mark as Injured'}
      >
        {busy ? '...' : player.injured ? 'R' : 'X'}
      </button>
    </div>
  );
}

function BenchPlayer({ player, onToggle, busy }) {
  const rc = ratingColor(player.overall);
  return (
    <div className={`bench-player ${player.injured ? 'bench-player--injured' : ''}`}>
      <span className="bench-pos">{player.position}</span>
      <span className="bench-name">{player.name}</span>
      <span className="bench-rating" style={{ color: rc }}>{player.overall}</span>
      <button
        className={`btn btn-sm ${player.injured ? 'btn-primary' : 'btn-secondary'}`}
        style={{ fontSize: '0.7rem', padding: '4px 8px' }}
        onClick={onToggle}
        disabled={busy}
      >
        {busy ? '...' : player.injured ? 'Restore' : 'Injure'}
      </button>
    </div>
  );
}

function RatingBar({ label, value, max = 100 }) {
  const pct = Math.round((value / max) * 100);
  const color =
    label === 'Attack'   ? 'pink' :
    label === 'Midfield' ? 'cyan' :
    label === 'Defense'  ? 'green' : 'gold';
  return (
    <div className="rating-bar-row">
      <span className="rating-bar-label label">{label}</span>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="rating-bar-val">{value}</span>
    </div>
  );
}

function TeamCard({ team, confederation, rating, players, onSelect }) {
  const confColor = CONF_COLOR[confederation] || CONF_COLOR.OTHER;
  const injured = players.filter(p => p.injured).length;

  return (
    <div className="team-card card" onClick={() => onSelect(team)} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(team)}>
      <div className="team-card-header" style={{ borderColor: confColor + '40' }}>
        <div className="team-card-flag">
          <div className="team-card-flag-icon" style={{ background: confColor + '20', color: confColor }}>
            {team.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="team-card-name-block">
          <h3 className="team-card-name">{team}</h3>
          <span className="badge" style={{
            background: confColor + '18', color: confColor,
            border: `1px solid ${confColor}30`, fontSize: '0.66rem'
          }}>{confederation}</span>
        </div>
        <div className="team-card-overall" style={{ color: ratingColor(rating.overall) }}>
          {Math.round(rating.overall)}
        </div>
      </div>

      <div className="team-card-bars">
        <RatingBar label="Attack"   value={Math.round(rating.attack)} />
        <RatingBar label="Midfield" value={Math.round(rating.midfield)} />
        <RatingBar label="Defense"  value={Math.round(rating.defense)} />
      </div>

      <div className="team-card-footer">
        <span className="label text-muted">{players.length} players</span>
        {injured > 0 && <span className="badge badge-red">{injured} injured</span>}
      </div>
    </div>
  );
}

function TeamModal({ teamData, onClose, onToggleInjury, updating }) {
  const { team, confederation, rating, players } = teamData;
  const confColor = CONF_COLOR[confederation] || CONF_COLOR.OTHER;
  const injured = players.filter(p => p.injured).length;

  return (
    <div className="modal-overlay animate-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box animate-up">
        <div className="modal-header" style={{ borderColor: confColor + '30' }}>
          <div>
            <div className="row gap-12 mb-8">
              <span className="badge" style={{ background: confColor + '18', color: confColor, border: `1px solid ${confColor}30` }}>
                {confederation}
              </span>
              {injured > 0 && <span className="badge badge-red">{injured} injured</span>}
            </div>
            <h2 className="display-md">{team}</h2>
          </div>

          <div className="modal-ratings">
            <div className="modal-overall" style={{ color: ratingColor(rating.overall) }}>
              {Math.round(rating.overall)}
            </div>
            <span className="label text-muted">Overall</span>
          </div>

          <button className="modal-close btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          <div className="modal-stat-row">
            <div className="stat-block">
              <span className="stat-value text-pink">{Math.round(rating.attack)}</span>
              <span className="stat-label">Attack</span>
            </div>
            <div className="stat-block">
              <span className="stat-value text-cyan">{Math.round(rating.midfield)}</span>
              <span className="stat-label">Midfield</span>
            </div>
            <div className="stat-block">
              <span className="stat-value text-green">{Math.round(rating.defense)}</span>
              <span className="stat-label">Defense</span>
            </div>
          </div>

          <div className="divider" />

          <PitchView
            players={players}
            team={team}
            onToggleInjury={onToggleInjury}
            updating={updating}
          />
        </div>
      </div>
    </div>
  );
}

export default function SquadsPage() {
  const [squads, setSquads]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState('');
  const [confFilter, setConfFilter]   = useState('All');
  const [selected, setSelected]       = useState(null);
  const [updating, setUpdating]       = useState(null);

  useEffect(() => {
    getSquads()
      .then(d => setSquads(d.teams || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return squads.filter(t => {
      const matchSearch = t.team.toLowerCase().includes(search.toLowerCase());
      const matchConf   = confFilter === 'All' || t.confederation === confFilter;
      return matchSearch && matchConf;
    });
  }, [squads, search, confFilter]);

  const selectedData = useMemo(() =>
    selected ? squads.find(t => t.team === selected) : null,
    [selected, squads]
  );

  async function handleToggleInjury(team, player) {
    setUpdating(player.name);
    try {
      const fn = player.injured ? restorePlayer : injurePlayer;
      const res = await fn(team, player.name);
      setSquads(prev => prev.map(t => {
        if (t.team !== team) return t;
        return {
          ...t,
          rating: res.new_rating,
          players: t.players.map(p =>
            p.name === player.name ? { ...p, injured: !player.injured } : p
          ),
        };
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  }

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
          <p>All 48 nations — EA FC 26 ratings, live injury management</p>
        </div>
      </div>

      {/* Controls */}
      <div className="container">
        <div className="squads-controls animate-up">
          <input
            id="squad-search"
            className="input squads-search"
            type="text"
            placeholder="Search nation..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="conf-chips">
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
          <span className="label text-muted" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {filtered.length} teams
          </span>
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
                <TeamCard
                  {...t}
                  onSelect={setSelected}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Modal */}
      {selectedData && (
        <TeamModal
          teamData={selectedData}
          onClose={() => setSelected(null)}
          onToggleInjury={handleToggleInjury}
          updating={updating}
        />
      )}
    </main>
  );
}
