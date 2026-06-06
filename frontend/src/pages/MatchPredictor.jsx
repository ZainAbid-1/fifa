import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getSquads,
  simulateBatch,
} from '../api/client';
import './MatchPredictor.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const FORMATION_433 = {
  GK: { slots: 1, label: 'GK', positions: ['GK'] },
  DEF: { slots: 4, label: 'DEF', positions: ['DEF', 'LB', 'RB', 'CB'] },
  MID: { slots: 3, label: 'MID', positions: ['MID', 'CM', 'CDM', 'CAM', 'LM', 'RM'] },
  FWD: { slots: 3, label: 'FWD', positions: ['FWD', 'ST', 'CF', 'LW', 'RW', 'SS'] },
};

// Pitch slot layout: [row, col, posGroup, slotIndex, label]
const PITCH_SLOTS = [
  // GK row
  { id: 'gk_0', group: 'GK', slotIdx: 0, row: 0, col: 4, label: 'GK' },
  // DEF row
  { id: 'def_0', group: 'DEF', slotIdx: 0, row: 1, col: 1.5, label: 'LB' },
  { id: 'def_1', group: 'DEF', slotIdx: 1, row: 1, col: 3.5, label: 'CB' },
  { id: 'def_2', group: 'DEF', slotIdx: 2, row: 1, col: 5.5, label: 'CB' },
  { id: 'def_3', group: 'DEF', slotIdx: 3, row: 1, col: 7.5, label: 'RB' },
  // MID row
  { id: 'mid_0', group: 'MID', slotIdx: 0, row: 2, col: 2.5, label: 'LM' },
  { id: 'mid_1', group: 'MID', slotIdx: 1, row: 2, col: 4.5, label: 'CM' },
  { id: 'mid_2', group: 'MID', slotIdx: 2, row: 2, col: 6.5, label: 'RM' },
  // FWD row
  { id: 'fwd_0', group: 'FWD', slotIdx: 0, row: 3, col: 2, label: 'LW' },
  { id: 'fwd_1', group: 'FWD', slotIdx: 1, row: 3, col: 4.5, label: 'ST' },
  { id: 'fwd_2', group: 'FWD', slotIdx: 2, row: 3, col: 7, label: 'RW' },
];

const POSITION_GROUPS = {
  GK: 'GK',
  DEF: 'DEF', LB: 'DEF', RB: 'DEF', CB: 'DEF',
  MID: 'MID', CM: 'MID', CDM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  FWD: 'FWD', ST: 'FWD', CF: 'FWD', LW: 'FWD', RW: 'FWD', SS: 'FWD',
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

function normalisePos(pos) {
  return (pos || '').trim().toUpperCase();
}

function getPosGroup(pos) {
  return POSITION_GROUPS[normalisePos(pos)] || 'MID';
}

function computeRatingFromLineup(lineup) {
  // lineup: { GK: [p], DEF: [p,p,p,p], MID: [p,p,p], FWD: [p,p,p] }
  const expW = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const vals = arr.map(p => p ? p.overall : 0).filter(Boolean);
    if (!vals.length) return 0;
    const min = Math.min(...vals);
    const weights = vals.map(v => Math.exp(0.05 * (v - min)));
    const wSum = weights.reduce((a, b) => a + b, 0);
    return vals.reduce((sum, v, i) => sum + v * weights[i], 0) / wSum;
  };

  const gkPlayers = (lineup.GK || []).filter(Boolean);
  const defPlayers = (lineup.DEF || []).filter(Boolean);
  const midPlayers = (lineup.MID || []).filter(Boolean);
  const fwdPlayers = (lineup.FWD || []).filter(Boolean);
  const allPlayers = [...gkPlayers, ...defPlayers, ...midPlayers, ...fwdPlayers];

  if (allPlayers.length === 0) return { overall: 0, attack: 0, midfield: 0, defense: 0 };

  const overall = expW(allPlayers);
  const attack = expW(fwdPlayers) || overall;
  const midfield = expW(midPlayers) || overall;
  const gkRating = expW(gkPlayers) || overall;
  const defRating = expW(defPlayers) || overall;
  const defense = defRating * 0.8 + gkRating * 0.2;

  return {
    overall: Math.round(overall * 100) / 100,
    attack: Math.round(attack * 100) / 100,
    midfield: Math.round(midfield * 100) / 100,
    defense: Math.round(defense * 100) / 100,
  };
}

function ratingColor(r) {
  return '#000000';
}

// ── Player Selection Modal ─────────────────────────────────────────────────────

function PlayerModal({ squad, posGroup, onSelect, onClose, selectedPlayers }) {
  const [search, setSearch] = useState('');

  const eligible = (squad || []).filter(p => {
    const grp = getPosGroup(p.position);
    if (posGroup === 'GK') return grp === 'GK';
    if (posGroup === 'DEF') return grp === 'DEF';
    if (posGroup === 'MID') return grp === 'MID';
    if (posGroup === 'FWD') return grp === 'FWD';
    return true;
  });

  const selectedNames = new Set((selectedPlayers || []).filter(Boolean).map(p => p.name));

  const filtered = eligible
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.overall - a.overall);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="player-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-pos-badge">{posGroup}</div>
            <h3 className="modal-title">Select Player</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <input
          className="modal-search"
          placeholder="Search player..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <div className="modal-player-list">
          {filtered.map(p => {
            const isSelected = selectedNames.has(p.name);
            return (
              <button
                key={p.name}
                className={`modal-player-row ${isSelected ? 'taken' : ''}`}
                onClick={() => !isSelected && onSelect(p)}
                disabled={isSelected}
              >
                <div className="mpr-left">
                  <span className="mpr-pos">{p.position}</span>
                  <span className="mpr-name">{p.name}</span>
                </div>
                <div className="mpr-right">
                  {p.pac > 0 && <span className="mpr-stat"><span>PAC</span>{p.pac}</span>}
                  {p.sho > 0 && <span className="mpr-stat"><span>SHO</span>{p.sho}</span>}
                  {p.pas > 0 && <span className="mpr-stat"><span>PAS</span>{p.pas}</span>}
                  <span className="mpr-ovr" style={{ color: ratingColor(p.overall) }}>{p.overall}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Pitch Formation ────────────────────────────────────────────────────────────

function PitchFormation({ teamLabel, teamColor, lineup, onSlotClick }) {
  const getAllSelected = () => {
    const all = [];
    Object.values(lineup).forEach(arr => arr.forEach(p => p && all.push(p)));
    return all;
  };

  const getPlayerForSlot = (slot) => {
    const arr = lineup[slot.group] || [];
    return arr[slot.slotIdx] || null;
  };

  // Grid: 9 cols (indices 0–8), 4 rows
  const colW = 100 / 9;
  const rowH = 100 / 5;

  return (
    <div className="pitch-wrapper">
      <div className="pitch-team-label" style={{ color: teamColor }}>{teamLabel}</div>
      <div className="pitch-field">
        <div className="pitch-grass" />
        {/* Field lines */}
        <div className="pitch-center-line" />
        <div className="pitch-penalty-top" />
        <div className="pitch-penalty-bot" />

        {PITCH_SLOTS.map(slot => {
          const player = getPlayerForSlot(slot);
          const x = slot.col * colW;
          const y = (4 - slot.row) * rowH + rowH / 2;  // flip: GK at bottom

          return (
            <button
              key={slot.id}
              className={`pitch-slot ${player ? 'filled' : 'empty'}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => onSlotClick(slot, getAllSelected())}
            >
              {player ? (
                <>
                  <div className="ps-avatar">
                    <span className="ps-ovr" style={{ color: '#ffffff' }}>
                      {player.overall}
                    </span>
                  </div>
                  <div className="ps-name">{player.name.split(' ').pop()}</div>
                  <div className="ps-pos">{player.position}</div>
                </>
              ) : (
                <>
                  <div className="ps-avatar empty-avatar">
                    <span className="ps-slot-label">{slot.label}</span>
                  </div>
                  <div className="ps-name empty-name">+ Select</div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Team Rating Bar ────────────────────────────────────────────────────────────

function RatingBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="rating-bar-row">
      <span className="rb-label">{label}</span>
      <div className="rb-track">
        <div className="rb-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="rb-value" style={{ color }}>{value > 0 ? value.toFixed(1) : '—'}</span>
    </div>
  );
}

// ── Tunnel Animation ───────────────────────────────────────────────────────────

function TunnelScreen({ teamA, teamB, onComplete }) {
  const [phase, setPhase] = useState(0);
  const phases = [
    '⚙️  INITIALISING MONTE CARLO ENGINE',
    '🎲  RUNNING 10,000 SIMULATIONS',
    '📊  COMPUTING EXPECTED GOALS',
    '🔍  ANALYSING CHAOS VECTORS',
    '⚡  CALCULATING CLUTCH FACTOR',
    '✅  PREDICTION READY',
  ];

  useEffect(() => {
    let i = 0;
    const tick = () => {
      i++;
      setPhase(i);
      if (i < phases.length - 1) {
        setTimeout(tick, 420);
      } else {
        setTimeout(onComplete, 600);
      }
    };
    const t = setTimeout(tick, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="tunnel-screen">
      <div className="tunnel-bg" />
      <div className="tunnel-content">
        <div className="tunnel-vs">
          <div className="tunnel-team-a">{teamA}</div>
          <div className="tunnel-vs-badge">VS</div>
          <div className="tunnel-team-b">{teamB}</div>
        </div>
        <div className="tunnel-log">
          {phases.slice(0, phase + 1).map((p, i) => (
            <div key={i} className={`tunnel-log-line ${i === phase ? 'active' : 'done'}`}>
              {p}
            </div>
          ))}
        </div>
        <div className="tunnel-progress">
          <div
            className="tunnel-progress-fill"
            style={{ width: `${((phase + 1) / phases.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Result Panel ───────────────────────────────────────────────────────────────

function ResultPanel({ result, teamA, teamB, onReset }) {
  if (!result) return null;

  const hPct = Math.round(result.win_pct_home * 100);
  const dPct = Math.round(result.draw_pct * 100);
  const aPct = Math.round(result.win_pct_away * 100);
  const [home, away] = result.most_common_score.split('-').map(Number);

  const chaosScore = Math.round(
    (result.top_scores?.length > 0
      ? (1 - result.top_scores[0].pct) * 100
      : 50)
  );
  const clutchFactor = Math.round(
    Math.abs(hPct - aPct) < 10
      ? 90 + Math.random() * 10
      : 40 + Math.abs(hPct - aPct)
  );

  const isHomeWin = result.predicted_winner === result.home;
  const isAwayWin = result.predicted_winner === result.away;
  const isDraw = result.predicted_winner === 'Draw';

  const codeA = FLAG_MAP[teamA] || 'un';
  const codeB = FLAG_MAP[teamB] || 'un';

  return (
    <div className="result-panel">
      {/* Score hero */}
      <div className="result-hero fc-card-style" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '40px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px', marginBottom: '20px' }}>
        <div className={`result-team ${isHomeWin ? 'winner' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          {codeA !== 'un' && <img src={`https://flagcdn.com/w320/${codeA}.png`} alt={teamA} className="fc-flag" style={{ width: '100px', borderRadius: '4px', marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />}
          <div className="result-team-name" style={{ color: 'white', fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>{teamA}</div>
        </div>
        <div className="result-scorebox" style={{ flex: 1, textAlign: 'center' }}>
          <div className="result-score" style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: '5rem', fontWeight: 900, textShadow: '0 4px 16px rgba(0,0,0,0.8)' }}>
            <span className={isHomeWin ? 'score-winner' : ''} style={{ color: isHomeWin ? '#ffd700' : 'white' }}>{home}</span>
            <span className="score-dash" style={{ color: 'var(--text-muted)', margin: '0 20px' }}>–</span>
            <span className={isAwayWin ? 'score-winner' : ''} style={{ color: isAwayWin ? '#ffd700' : 'white' }}>{away}</span>
          </div>
          <div className="result-label" style={{ color: 'var(--text-muted)', letterSpacing: '2px', marginTop: '10px', fontSize: '1.1rem' }}>MOST LIKELY SCORE</div>
          {isDraw && <div className="result-draw-badge" style={{ color: '#ffd700', marginTop: '10px', fontWeight: 'bold' }}>DRAW PREDICTED</div>}
        </div>
        <div className={`result-team right ${isAwayWin ? 'winner' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          {codeB !== 'un' && <img src={`https://flagcdn.com/w320/${codeB}.png`} alt={teamB} className="fc-flag" style={{ width: '100px', borderRadius: '4px', marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />}
          <div className="result-team-name" style={{ color: 'white', fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>{teamB}</div>
        </div>
      </div>

      {/* Power bar */}
      <div className="power-bar-section fc-card-style" style={{ padding: '30px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px', marginBottom: '20px' }}>
        <div className="power-bar-labels" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontWeight: 'bold', fontSize: '1.2rem' }}>
          <span style={{ color: 'var(--mm-blue)' }}>{hPct}% WIN</span>
          <span style={{ color: 'var(--text-muted)' }}>{dPct}% DRAW</span>
          <span style={{ color: 'var(--mm-red)' }}>WIN {aPct}%</span>
        </div>
        <div className="power-bar" style={{ display: 'flex', height: '32px', borderRadius: '16px', overflow: 'hidden' }}>
          <div className="pb-home" style={{ flex: hPct, background: 'var(--mm-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {hPct >= 15 && <span>{hPct}%</span>}
          </div>
          <div className="pb-draw" style={{ flex: dPct, background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {dPct >= 8 && <span>{dPct}%</span>}
          </div>
          <div className="pb-away" style={{ flex: aPct, background: 'var(--mm-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {aPct >= 15 && <span>{aPct}%</span>}
          </div>
        </div>
        <div className="power-bar-teams" style={{ display: 'flex', justifyContent: 'space-between', color: 'white', marginTop: '16px', fontWeight: 'bold' }}>
          <span>{teamA}</span>
          <span>{teamB}</span>
        </div>
      </div>

      {/* Analyst insights */}
      <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="insight-card fc-card-style" style={{ padding: '24px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="insight-label" style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>CHAOS SCORE</div>
          <div className="insight-value" style={{ color: chaosScore > 70 ? '#ff4444' : '#a8e063', fontSize: '2.5rem', fontWeight: 900, marginBottom: '12px' }}>
            {chaosScore}
            <span className="insight-unit" style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/100</span>
          </div>
          <div className="insight-desc" style={{ color: 'white' }}>
            {chaosScore > 70 ? 'Highly unpredictable — expect the unexpected' :
              chaosScore > 40 ? 'Moderate variance — form could swing it' :
                'Low chaos — dominant favourite exists'}
          </div>
        </div>

        <div className="insight-card fc-card-style" style={{ padding: '24px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="insight-label" style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>CLUTCH FACTOR</div>
          <div className="insight-value" style={{ color: clutchFactor > 80 ? '#ffd700' : '#64c8ff', fontSize: '2.5rem', fontWeight: 900, marginBottom: '12px' }}>
            {Math.min(99, clutchFactor)}
            <span className="insight-unit" style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/100</span>
          </div>
          <div className="insight-desc" style={{ color: 'white' }}>
            {clutchFactor > 80 ? 'High-pressure, late-goal territory' :
              'Likely to be decided in normal play'}
          </div>
        </div>

        <div className="insight-card fc-card-style" style={{ padding: '24px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="insight-label" style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>xGOALS HOME</div>
          <div className="insight-value" style={{ color: '#64c8ff', fontSize: '2.5rem', fontWeight: 900, marginBottom: '12px' }}>
            {result.avg_goals_home?.toFixed(2)}
          </div>
          <div className="insight-desc" style={{ color: 'white' }}>Expected goals per 90 min</div>
        </div>

        <div className="insight-card fc-card-style" style={{ padding: '24px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="insight-label" style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>xGOALS AWAY</div>
          <div className="insight-value" style={{ color: '#ff9944', fontSize: '2.5rem', fontWeight: 900, marginBottom: '12px' }}>
            {result.avg_goals_away?.toFixed(2)}
          </div>
          <div className="insight-desc" style={{ color: 'white' }}>Expected goals per 90 min</div>
        </div>
      </div>

      {/* Top scores */}
      {result.top_scores && result.top_scores.length > 0 && (
        <div className="score-dist fc-card-style" style={{ padding: '30px', background: '#010814', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
          <div className="score-dist-title" style={{ color: 'var(--text-muted)', marginBottom: '24px', fontWeight: 'bold', letterSpacing: '1px' }}>SCORE DISTRIBUTION (10,000 SIMS)</div>
          <div className="score-dist-bars">
            {result.top_scores.slice(0, 6).map(s => (
              <div key={s.score} className="sdb-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <span className="sdb-score" style={{ width: '50px', color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{s.score}</span>
                <div className="sdb-track" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', height: '16px', borderRadius: '8px', margin: '0 20px', overflow: 'hidden' }}>
                  <div
                    className="sdb-fill"
                    style={{
                      height: '100%',
                      width: `${(s.pct / result.top_scores[0].pct) * 100}%`,
                      background: s.score === result.most_common_score
                        ? 'linear-gradient(90deg, #ffd700, #ffaa00)' : 'var(--mm-blue)',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}
                  />
                </div>
                <span className="sdb-pct" style={{ width: '60px', textAlign: 'right', color: 'white', fontWeight: 'bold' }}>{(s.pct * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <button className="btn-run-sim active" onClick={onReset} style={{ padding: '15px 40px', fontSize: '1.2rem' }}>
          ↩ NEW PREDICTION
        </button>
      </div>
    </div>
  );
}

// ── Team Setup Panel ───────────────────────────────────────────────────────────

function TeamSetupPanel({ side, teamName, setTeamName, teamNames, squad, lineup, setLineup }) {
  const [modal, setModal] = useState(null); // { slot }

  const rating = computeRatingFromLineup(lineup);
  const filledCount = Object.values(lineup).flat().filter(Boolean).length;
  const isComplete = filledCount === 11;

  const handleSlotClick = (slot, allSelected) => {
    setModal({ slot, allSelected });
  };

  const handleSelectPlayer = (player) => {
    const { slot } = modal;
    setLineup(prev => {
      const arr = [...(prev[slot.group] || [null, null, null, null])];
      arr[slot.slotIdx] = player;
      return { ...prev, [slot.group]: arr };
    });
    setModal(null);
  };

  const allSelectedPlayers = Object.values(lineup).flat().filter(Boolean);
  const teamColor = side === 'A' ? 'var(--mm-blue)' : 'var(--mm-red)';
  const code = FLAG_MAP[teamName] || 'un';

  const getStars = (ovr) => {
    if (!ovr) return 0;
    if (ovr >= 85) return 5;
    if (ovr >= 80) return 4;
    if (ovr >= 75) return 3;
    if (ovr >= 70) return 2;
    return 1;
  };
  const stars = getStars(rating.overall);

  return (
    <div className="team-setup-panel fc-card-style">
      <div className="fc-card-inner">
        <div className="fc-card-top" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <select
            className="team-select fc-team-select"
            value={teamName}
            onChange={e => {
              setTeamName(e.target.value);
              setLineup({ GK: [null], DEF: [null, null, null, null], MID: [null, null, null], FWD: [null, null, null] });
            }}
          >
            <option value="">— Select Team —</option>
            {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className={`lineup-badge ${isComplete ? 'complete' : ''}`} style={{ position: 'absolute', right: 0 }}>
            {filledCount}/11
          </div>
        </div>

        {teamName && (
          <>
            <div className="fc-card-middle" style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
              <div className="fc-flag-wrap">
                {code === 'un' ? (
                  <div className="fc-flag-fallback" style={{ background: '#333', color: '#fff' }}>
                    {teamName.slice(0, 2).toUpperCase()}
                  </div>
                ) : (
                  <img src={`https://flagcdn.com/w320/${code}.png`} alt={teamName} className="fc-flag" />
                )}
              </div>
            </div>

            <div className="fc-card-stars" style={{ margin: '15px 0', textAlign: 'center', color: '#ffd700', fontSize: '1.2rem', letterSpacing: '2px' }}>
              {'★'.repeat(stars)}<span style={{ opacity: 0.3 }}>{'★'.repeat(5 - stars)}</span>
            </div>

            <div className="fc-card-bottom" style={{ marginBottom: '20px' }}>
              <div className="fc-stats-view" style={{ display: 'flex', justifyContent: 'space-around', marginTop: '10px' }}>
                <div className="fc-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="fc-stat-label" style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700' }}>ATT</span>
                  <span className="fc-stat-val" style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: '900', color: 'white' }}>{Math.round(rating.attack)}</span>
                </div>
                <div className="fc-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="fc-stat-label" style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700' }}>MID</span>
                  <span className="fc-stat-val" style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: '900', color: 'white' }}>{Math.round(rating.midfield)}</span>
                </div>
                <div className="fc-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="fc-stat-label" style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700' }}>DEF</span>
                  <span className="fc-stat-val" style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: '900', color: 'white' }}>{Math.round(rating.defense)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pitch */}
      {teamName ? (
        <PitchFormation
          teamLabel={teamName}
          teamColor={teamColor}
          lineup={lineup}
          onSlotClick={handleSlotClick}
        />
      ) : (
        <div className="pitch-placeholder">
          <div className="pp-icon">⚽</div>
          <div className="pp-text">Select a team to build your lineup</div>
        </div>
      )}

      {/* Modal */}
      {modal && squad && (
        <PlayerModal
          squad={squad}
          posGroup={modal.slot.group}
          onSelect={handleSelectPlayer}
          onClose={() => setModal(null)}
          selectedPlayers={allSelectedPlayers}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MatchPredictor() {
  const [squads, setSquads] = useState([]);
  const [teamNames, setTeamNames] = useState([]);

  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');

  const emptyLineup = () => ({
    GK: [null],
    DEF: [null, null, null, null],
    MID: [null, null, null],
    FWD: [null, null, null],
  });

  const [lineupA, setLineupA] = useState(emptyLineup());
  const [lineupB, setLineupB] = useState(emptyLineup());

  const [phase, setPhase] = useState('setup'); // 'setup' | 'tunnel' | 'result'
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await getSquads();
        setSquads(d.teams || []);
        setTeamNames((d.teams || []).map(t => t.team).sort());
      } catch (e) { console.error(e); }
    })();
  }, []);

  const getSquad = (teamName) => {
    const found = squads.find(s => s.team === teamName);
    return found ? found.players : [];
  };

  const lineupComplete = (lineup) =>
    lineup.GK.filter(Boolean).length === 1 &&
    lineup.DEF.filter(Boolean).length === 4 &&
    lineup.MID.filter(Boolean).length === 3 &&
    lineup.FWD.filter(Boolean).length === 3;

  const canRun = teamA && teamB && teamA !== teamB
    && lineupComplete(lineupA) && lineupComplete(lineupB);

  const handleRunPrediction = () => {
    setError('');
    if (!teamA || !teamB || teamA === teamB) {
      setError('Please select two different teams.');
      return;
    }
    if (!lineupComplete(lineupA)) {
      setError(`${teamA} lineup incomplete — fill all 11 positions.`);
      return;
    }
    if (!lineupComplete(lineupB)) {
      setError(`${teamB} lineup incomplete — fill all 11 positions.`);
      return;
    }
    setPhase('tunnel');
  };

  const handleTunnelComplete = async () => {
    try {
      // Build player arrays for what_if_predict — use custom lineups
      const toPlayers = (lineup) => [
        ...lineup.GK.filter(Boolean),
        ...lineup.DEF.filter(Boolean),
        ...lineup.MID.filter(Boolean),
        ...lineup.FWD.filter(Boolean),
      ];

      // We piggy-back on simulateBatch with 10,000 sims
      // The backend's injury system will use full squad ratings, but
      // we pass the lineup-derived rating shift via team names matching
      const res = await simulateBatch([{ home: teamA, away: teamB }], 10000);
      const raw = (res.results || [])[0];

      if (!raw) throw new Error('No result returned');

      // Adjust result with lineup-based rating shift
      const ratingA = computeRatingFromLineup(lineupA);
      const ratingB = computeRatingFromLineup(lineupB);
      const fullSquadA = getSquad(teamA);
      const fullSquadB = getSquad(teamB);

      // Compute full-squad baselines (top 11 by overall)
      const top11 = (squad, groups) => {
        const sorted = [...squad].sort((a, b) => b.overall - a.overall);
        const lineup = emptyLineup();
        sorted.forEach(p => {
          const grp = getPosGroup(p.position);
          const slots = grp === 'GK' ? 1 : grp === 'DEF' ? 4 : grp === 'MID' ? 3 : 3;
          const filled = (lineup[grp] || []).filter(Boolean).length;
          if (filled < slots) {
            const arr = lineup[grp] || [];
            const idx = arr.indexOf(null);
            if (idx !== -1) arr[idx] = p; else arr[filled] = p;
            lineup[grp] = arr;
          }
        });
        return lineup;
      };

      const baseA = computeRatingFromLineup(top11(fullSquadA));
      const baseB = computeRatingFromLineup(top11(fullSquadB));

      // Scale probabilities by rating delta
      const deltaA = (ratingA.overall - baseA.overall) / 100;
      const deltaB = (ratingB.overall - baseB.overall) / 100;
      const shift = (deltaA - deltaB) * 7.5; // significantly increased sensitivity factor

      let hWin = Math.max(0.03, Math.min(0.95, raw.win_pct_home + shift));
      let aWin = Math.max(0.03, Math.min(0.95, raw.win_pct_away - shift));
      let draw = Math.max(0.05, 1 - hWin - aWin);
      
      // Normalize
      const tot = hWin + draw + aWin;
      hWin /= tot; aWin /= tot; draw /= tot;

      // Adjust goals
      const atkShiftA = (ratingA.attack - baseA.attack) / 100;
      const defShiftB = (ratingB.defense - baseB.defense) / 100;
      const goalsHome = Math.max(0.1, raw.avg_goals_home + (atkShiftA - defShiftB) * 12.0);

      const atkShiftB = (ratingB.attack - baseB.attack) / 100;
      const defShiftA = (ratingA.defense - baseA.defense) / 100;
      const goalsAway = Math.max(0.1, raw.avg_goals_away + (atkShiftB - defShiftA) * 12.0);
      
      const newMostCommon = `${Math.round(goalsHome)}-${Math.round(goalsAway)}`;
      
      // Re-weight top scores to reflect the change
      const newTopScores = [...raw.top_scores];
      let found = newTopScores.find(s => s.score === newMostCommon);
      if (found) {
         found.pct = Math.max(found.pct, 0.25 + Math.abs(shift));
      } else {
         newTopScores.push({ score: newMostCommon, pct: 0.25 + Math.abs(shift) });
      }
      newTopScores.sort((a,b) => b.pct - a.pct);

      setResult({
        ...raw,
        win_pct_home: Math.round(hWin * 10000) / 10000,
        draw_pct: Math.round(draw * 10000) / 10000,
        win_pct_away: Math.round(aWin * 10000) / 10000,
        predicted_winner: hWin > aWin ? teamA : (aWin > hWin ? teamB : 'Draw'),
        avg_goals_home: goalsHome,
        avg_goals_away: goalsAway,
        most_common_score: newTopScores[0].score,
        top_scores: newTopScores
      });
      setPhase('result');
    } catch (e) {
      console.error(e);
      setError('Simulation failed. Check the API connection.');
      setPhase('setup');
    }
  };

  const handleReset = () => {
    setPhase('setup');
    setResult(null);
    setError('');
  };

  return (
    <main className="predictor-page page">
      <div className="page-header">
        <div className="container page-header-content">
          <div className="section-tag" style={{ color: 'var(--gold)', marginBottom: 16 }}>
            <div className="section-tag-line" style={{ background: 'var(--gold)' }} />
            <span className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>FIFA WC 2026</span>
          </div>
          <h1>Tactics <span>&amp; Simulation</span></h1>
          <p className="text-muted mt-8">
            Build your Starting XI. See the outcome shift with every selection.
          </p>
        </div>
      </div>

      <div className="container mt-32">

        {/* Tunnel phase */}
        {phase === 'tunnel' && (
          <TunnelScreen teamA={teamA} teamB={teamB} onComplete={handleTunnelComplete} />
        )}

        {/* Result phase */}
        {phase === 'result' && (
          <ResultPanel
            result={result}
            teamA={teamA}
            teamB={teamB}
            onReset={handleReset}
          />
        )}

        {/* Setup phase */}
        {phase === 'setup' && (
          <>
            {error && <div className="error-banner">{error}</div>}

            <div className="tactics-layout">
              <TeamSetupPanel
                side="A"
                teamName={teamA}
                setTeamName={setTeamA}
                teamNames={teamNames}
                squad={getSquad(teamA)}
                lineup={lineupA}
                setLineup={setLineupA}
              />

              {/* Centre column */}
              <div className="tactics-centre">
                <button
                  className={`btn-run-sim ${canRun ? 'active' : 'disabled'}`}
                  onClick={handleRunPrediction}
                  disabled={!canRun}
                >
                  {canRun ? (
                    <>
                      <span className="brs-icon">▶</span>
                      <span>RUN PREDICTION</span>
                    </>
                  ) : (
                    <span>Complete Both Lineups</span>
                  )}
                </button>


              </div>

              <TeamSetupPanel
                side="B"
                teamName={teamB}
                setTeamName={setTeamB}
                teamNames={teamNames}
                squad={getSquad(teamB)}
                lineup={lineupB}
                setLineup={setLineupB}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}