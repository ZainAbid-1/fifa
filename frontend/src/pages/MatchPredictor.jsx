import { useEffect, useState, useCallback } from 'react';
import { predictMatch, whatIfPredict, getSquads } from '../api/client';
import './MatchPredictor.css';

function ProbBar({ labelA, labelB, probA, probB, probD }) {
  const pA = Math.round((probA || 0) * 100);
  const pD = Math.round((probD || 0) * 100);
  const pB = Math.round((probB || 0) * 100);

  return (
    <div className="prob-bar-wrap">
      <div className="prob-labels">
        <span className="prob-label-team text-blue">{labelA}</span>
        <span className="prob-label-draw text-muted">Draw</span>
        <span className="prob-label-team text-red">{labelB}</span>
      </div>
      <div className="prob-bar-track">
        <div className="prob-segment prob-segment--a" style={{ width: `${pA}%` }}>
          {pA >= 12 && <span>{pA}%</span>}
        </div>
        <div className="prob-segment prob-segment--d" style={{ width: `${pD}%` }}>
          {pD >= 8 && <span>{pD}%</span>}
        </div>
        <div className="prob-segment prob-segment--b" style={{ width: `${pB}%` }}>
          {pB >= 12 && <span>{pB}%</span>}
        </div>
      </div>
      <div className="prob-vals">
        <span className="text-blue bold">{pA}%</span>
        <span className="text-muted">{pD}%</span>
        <span className="text-red bold">{pB}%</span>
      </div>
    </div>
  );
}

function ChaosBadge({ score, isTrap }) {
  const level = score > 30 ? 'high' : score > 15 ? 'medium' : 'low';
  const colors = { high: 'badge-red', medium: 'badge-gold', low: 'badge-green' };
  return (
    <div className="chaos-block">
      <span className={`badge ${colors[level]}`}>
        Chaos {level.toUpperCase()} — {score.toFixed(1)}
      </span>
      {isTrap && (
        <span className="badge badge-red" style={{ marginLeft: 8 }}>Trap Game</span>
      )}
    </div>
  );
}

function AltitudeBlock({ context }) {
  if (!context?.venue) return null;
  const hasPenalty = context.altitude_penalty > 0;
  return (
    <div className={`altitude-block ${hasPenalty ? 'altitude-block--active' : ''}`}>
      <span className="label">{context.venue}</span>
      <span className={hasPenalty ? 'text-gold' : 'text-muted'} style={{ fontSize: '0.85rem' }}>
        {context.impact_message}
      </span>
    </div>
  );
}

function PenaltyBlock({ metrics, teamA, teamB }) {
  if (!metrics) return null;
  const cfA = metrics.clutch_factor_a;
  const cfB = metrics.clutch_factor_b;
  return (
    <div className="penalty-block">
      <p className="label text-muted mb-8">Penalty Shootout Clutch</p>
      <div className="penalty-bars">
        <div className="penalty-bar-row">
          <span className="penalty-team">{teamA}</span>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill cyan" style={{ width: `${Math.round(cfA * 100)}%` }} />
          </div>
          <span className="penalty-pct text-blue">{Math.round(cfA * 100)}%</span>
        </div>
        <div className="penalty-bar-row">
          <span className="penalty-team">{teamB}</span>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill pink" style={{ width: `${Math.round(cfB * 100)}%` }} />
          </div>
          <span className="penalty-pct text-red">{Math.round(cfB * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

const VENUES = [
  '', 'MetLife Stadium, New York/New Jersey', 'AT&T Stadium, Dallas',
  'SoFi Stadium, Los Angeles', 'Levi\'s Stadium, San Francisco',
  'Arrowhead Stadium, Kansas City', 'Gillette Stadium, Boston',
  'Lincoln Financial Field, Philadelphia', 'Hard Rock Stadium, Miami',
  'Mercedes-Benz Stadium, Atlanta', 'NRG Stadium, Houston',
  'Estadio Azteca, Mexico City', 'BC Place, Vancouver',
];

export default function MatchPredictor() {
  const [teams, setTeams]           = useState([]);
  const [teamA, setTeamA]           = useState('');
  const [teamB, setTeamB]           = useState('');
  const [venue, setVenue]           = useState('');
  const [result, setResult]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [mode, setMode]             = useState('standard'); // 'standard' | 'whatif'
  const [adjA, setAdjA]             = useState({ ea_attack: 0, ea_defense: 0, ea_midfield: 0 });
  const [adjB, setAdjB]             = useState({ ea_attack: 0, ea_defense: 0, ea_midfield: 0 });

  useEffect(() => {
    getSquads()
      .then(d => setTeams((d.teams || []).map(t => t.team).sort()))
      .catch(() => {});
  }, []);

  function swap() {
    setTeamA(teamB);
    setTeamB(teamA);
    setResult(null);
  }

  const handlePredict = useCallback(async () => {
    if (!teamA || !teamB || teamA === teamB) {
      setError('Please select two different teams.');
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      let res;
      if (mode === 'whatif') {
        const adjustments = {};
        const hasAdjA = Object.values(adjA).some(v => v !== 0);
        const hasAdjB = Object.values(adjB).some(v => v !== 0);
        if (hasAdjA) adjustments[teamA] = adjA;
        if (hasAdjB) adjustments[teamB] = adjB;
        res = await whatIfPredict(teamA, teamB, venue, adjustments);
      } else {
        res = await predictMatch(teamA, teamB, venue);
      }
      setResult(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [teamA, teamB, venue, mode, adjA, adjB]);

  function AdjSlider({ label, stat, adj, setAdj }) {
    return (
      <div className="adj-slider-row">
        <span className="adj-slider-label label">{label}</span>
        <input
          type="range" min="-10" max="10" step="1"
          value={adj[stat]}
          onChange={e => setAdj(prev => ({ ...prev, [stat]: Number(e.target.value) }))}
          className="adj-slider"
        />
        <span className={`adj-slider-val ${adj[stat] > 0 ? 'text-green' : adj[stat] < 0 ? 'text-red' : 'text-muted'}`}>
          {adj[stat] > 0 ? `+${adj[stat]}` : adj[stat]}
        </span>
      </div>
    );
  }

  const canPredict = teamA && teamB && teamA !== teamB;

  return (
    <main className="predictor-page page">
      <div className="page-header">
        <div className="container page-header-content">
          <div className="section-tag" style={{ color: 'var(--lime)', marginBottom: 16 }}>
            <div className="section-tag-line" style={{ background: 'var(--lime)' }} />
            <span className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>FIFA WC 2026</span>
          </div>
          <h1>Match <span>Predictor</span></h1>
          <p className="text-muted center mt-8">
            AI-powered head-to-head rivalry engine with what-if scenario support
          </p>
        </div>
      </div>

      <div className="container">
        <div className="predictor-layout">
          {/* ── Left Panel: Inputs ── */}
          <div className="predictor-inputs animate-up">
            {/* Mode toggle */}
            <div className="tab-bar mb-20">
              <button className={`tab-btn ${mode === 'standard' ? 'active' : ''}`} onClick={() => setMode('standard')}>Standard</button>
              <button className={`tab-btn ${mode === 'whatif'   ? 'active' : ''}`} onClick={() => setMode('whatif')}>What-If</button>
            </div>

            {/* Team selectors */}
            <div className="team-selector-block card-elevated">
              <div className="team-selector-row">
                <div className="col gap-8" style={{ flex: 1 }}>
                  <label className="label" htmlFor="team-a-select">Home / Team A</label>
                  <select
                    id="team-a-select"
                    className="input team-select"
                    value={teamA}
                    onChange={e => { setTeamA(e.target.value); setResult(null); }}
                  >
                    <option value="">Select team...</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <button className="swap-btn btn btn-ghost" onClick={swap} title="Swap teams">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 16V4m0 0L3 8m4-4 4 4"/>
                    <path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
                  </svg>
                </button>

                <div className="col gap-8" style={{ flex: 1 }}>
                  <label className="label" htmlFor="team-b-select">Away / Team B</label>
                  <select
                    id="team-b-select"
                    className="input team-select"
                    value={teamB}
                    onChange={e => { setTeamB(e.target.value); setResult(null); }}
                  >
                    <option value="">Select team...</option>
                    {teams.filter(t => t !== teamA).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {teamA && teamB && teamA !== teamB && (
                <div className="vs-display animate-in">
                  <span className="vs-team text-blue">{teamA}</span>
                  <span className="vs-divider">vs</span>
                  <span className="vs-team text-red">{teamB}</span>
                </div>
              )}
            </div>

            {/* Venue */}
            <div className="col gap-8 mt-16">
              <label className="label" htmlFor="venue-select">Venue (Optional)</label>
              <select
                id="venue-select"
                className="input"
                value={venue}
                onChange={e => setVenue(e.target.value)}
              >
                {VENUES.map(v => <option key={v} value={v}>{v || 'Neutral Venue'}</option>)}
              </select>
            </div>

            {/* What-If adjustments */}
            {mode === 'whatif' && teamA && teamB && (
              <div className="whatif-adjustments animate-in mt-16">
                <p className="label text-muted mb-12">Stat Adjustments (EA ratings delta)</p>
                <div className="adj-panels">
                  <div className="adj-panel card">
                    <span className="label text-blue mb-12">{teamA || 'Team A'}</span>
                    <AdjSlider label="Attack"   stat="ea_attack"   adj={adjA} setAdj={setAdjA} />
                    <AdjSlider label="Midfield" stat="ea_midfield" adj={adjA} setAdj={setAdjA} />
                    <AdjSlider label="Defense"  stat="ea_defense"  adj={adjA} setAdj={setAdjA} />
                  </div>
                  <div className="adj-panel card">
                    <span className="label text-red mb-12">{teamB || 'Team B'}</span>
                    <AdjSlider label="Attack"   stat="ea_attack"   adj={adjB} setAdj={setAdjB} />
                    <AdjSlider label="Midfield" stat="ea_midfield" adj={adjB} setAdj={setAdjB} />
                    <AdjSlider label="Defense"  stat="ea_defense"  adj={adjB} setAdj={setAdjB} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="pred-error animate-in">{error}</div>
            )}

            <button
              id="predict-btn"
              className="btn btn-primary btn-lg mt-20"
              style={{ width: '100%' }}
              onClick={handlePredict}
              disabled={loading || !canPredict}
            >
              {loading
                ? <><div className="spinner spinner-sm" /> Predicting...</>
                : 'Predict Match'
              }
            </button>
          </div>

          {/* ── Right Panel: Result ── */}
          <div className="predictor-result animate-up delay-2">
            {!result && !loading && (
              <div className="result-placeholder">
                <div className="placeholder-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="m4.93 4.93 14.14 14.14"/>
                  </svg>
                </div>
                <p className="text-muted mt-16">Select two teams and click Predict</p>
              </div>
            )}

            {loading && (
              <div className="flex-center" style={{ minHeight: 300 }}>
                <div className="loading-state">
                  <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
                  <span className="text-muted">Running AI prediction...</span>
                </div>
              </div>
            )}

            {result && !loading && (
              <div className="result-content animate-in">
                {/* Header */}
                <div className="result-header card-elevated">
                  <div className="result-teams">
                    <div className="result-team-block">
                      <span className="result-team-name text-blue">{result.team_a}</span>
                      <span className="result-win-pct">{Math.round((result.win_prob_a || 0) * 100)}%</span>
                      <span className="label text-muted">win probability</span>
                    </div>
                    <div className="result-draw-block">
                      <span className="result-draw-pct">{Math.round((result.draw_prob || 0) * 100)}%</span>
                      <span className="label text-muted">draw</span>
                    </div>
                    <div className="result-team-block result-team-block--right">
                      <span className="result-team-name text-red">{result.team_b}</span>
                      <span className="result-win-pct">{Math.round((result.win_prob_b || 0) * 100)}%</span>
                      <span className="label text-muted">win probability</span>
                    </div>
                  </div>

                  <ProbBar
                    labelA={result.team_a}
                    labelB={result.team_b}
                    probA={result.win_prob_a}
                    probB={result.win_prob_b}
                    probD={result.draw_prob}
                  />
                </div>

                {/* Additional insights (only for standard mode) */}
                {result.chaos_potential && (
                  <div className="result-section card mt-16">
                    <p className="label text-muted mb-8">Chaos Potential</p>
                    <ChaosBadge
                      score={result.chaos_potential.score}
                      isTrap={result.chaos_potential.is_trap_game}
                    />
                  </div>
                )}

                {result.context && (
                  <div className="result-section card mt-16">
                    <AltitudeBlock context={result.context} />
                  </div>
                )}

                {result.penalty_metrics && (
                  <div className="result-section card mt-16">
                    <PenaltyBlock
                      metrics={result.penalty_metrics}
                      teamA={result.team_a}
                      teamB={result.team_b}
                    />
                  </div>
                )}

                <button
                  className="btn btn-ghost btn-sm mt-16"
                  style={{ width: '100%' }}
                  onClick={() => setResult(null)}
                >
                  Clear Result
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
