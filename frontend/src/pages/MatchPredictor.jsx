import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  getSquads, 
  getGroupFixtures, 
  simulateBatch, 
  injurePlayer, 
  restorePlayer,
  getTournamentState,
  startTournament
} from '../api/client';
import './MatchPredictor.css';

// ── Components ─────────────────────────────────────────────────────────────

function MatchCard({ match, onComplete }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slight delay for animation
    const t = setTimeout(() => {
      setVisible(true);
      if (onComplete) setTimeout(onComplete, 500); // Trigger next card
    }, 100);
    return () => clearTimeout(t);
  }, [onComplete]);

  if (!match) return null;

  const hPct = Math.round(match.win_pct_home * 100);
  const dPct = Math.round(match.draw_pct * 100);
  const aPct = Math.round(match.win_pct_away * 100);
  
  const isHomeWin = match.predicted_winner === match.home;
  const isAwayWin = match.predicted_winner === match.away;

  return (
    <div className={`match-card ${visible ? 'entering' : ''}`}>
      <div className="match-card-teams">
        <div className={`match-card-team ${isHomeWin ? 'winner' : ''}`}>
          <span className="team-name">{match.home}</span>
        </div>
        <div className="match-card-score">
          {match.most_common_score}
        </div>
        <div className={`match-card-team right ${isAwayWin ? 'winner' : ''}`}>
          <span className="team-name">{match.away}</span>
        </div>
      </div>
      
      <div className="match-card-stats">
        <div className="prob-bar-track">
          <div className="prob-segment prob-segment--a" style={{ width: `${hPct}%` }}>
            {hPct >= 12 && <span>{hPct}%</span>}
          </div>
          <div className="prob-segment prob-segment--d" style={{ width: `${dPct}%` }}>
            {dPct >= 8 && <span>{dPct}%</span>}
          </div>
          <div className="prob-segment prob-segment--b" style={{ width: `${aPct}%` }}>
            {aPct >= 12 && <span>{aPct}%</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function InjuryPanel({ teams, squads, onInjuryChange }) {
  const [expandedTeam, setExpandedTeam] = useState(null);

  if (!teams || teams.length === 0) return null;

  return (
    <div className="injury-panel card">
      <h3 className="injury-title">Live Squad Status</h3>
      <p className="text-muted text-sm mb-16">Injure/recover players mid-simulation to see the impact.</p>
      
      <div className="injury-teams">
        {teams.map(teamName => {
          const squad = squads.find(s => s.team === teamName);
          if (!squad) return null;
          
          const isExpanded = expandedTeam === teamName;
          const injuredCount = squad.players.filter(p => p.injured).length;

          return (
            <div key={teamName} className="injury-team-block">
              <div 
                className="injury-team-header" 
                onClick={() => setExpandedTeam(isExpanded ? null : teamName)}
              >
                <span className="team-name">{teamName}</span>
                <div className="team-status">
                  {injuredCount > 0 && <span className="badge badge-red">{injuredCount} Injured</span>}
                  <svg className={`chevron ${isExpanded ? 'up' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
              </div>
              
              {isExpanded && (
                <div className="injury-players">
                  {squad.players.map(p => (
                    <div key={p.name} className={`player-row ${p.injured ? 'injured' : ''}`}>
                      <div className="player-info">
                        <span className="pos text-muted">{p.position}</span>
                        <span className="name">{p.name}</span>
                        <span className="ovr">{p.overall}</span>
                      </div>
                      <button 
                        className={`action-btn ${p.injured ? 'recover' : 'injure'}`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (p.injured) await restorePlayer(teamName, p.name);
                          else await injurePlayer(teamName, p.name);
                          onInjuryChange();
                        }}
                        title={p.injured ? "Recover Player" : "Injure Player"}
                      >
                        {p.injured ? '💚' : '⚡'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MatchPredictor() {
  const [activeTab, setActiveTab] = useState('simulator'); // 'simulator' | 'bracket'
  
  // Squads Data
  const [squads, setSquads] = useState([]);
  const [teamNames, setTeamNames] = useState([]);
  
  // Simulator State
  const [scope, setScope] = useState('single'); // 'single', 'group', 'r32', 'r16', 'date'
  const [simsCount, setSimsCount] = useState(5000);
  
  // Single scope
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  
  // Date scope
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Simulation Run State
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [needsResim, setNeedsResim] = useState(false);
  const [activeTeams, setActiveTeams] = useState([]);
  
  // Tournament state (for Bracket & KO scopes)
  const [tourneyState, setTourneyState] = useState(null);

  // Load initial data
  useEffect(() => {
    loadSquads();
    checkTourney();
  }, []);

  async function loadSquads() {
    try {
      const d = await getSquads();
      setSquads(d.teams || []);
      setTeamNames((d.teams || []).map(t => t.team).sort());
    } catch (e) { console.error(e); }
  }

  async function checkTourney() {
    try {
      const st = await getTournamentState();
      setTourneyState(st);
    } catch (e) { console.error("No tournament state yet"); }
  }

  // ── Simulator Logic ──

  const handleRunSim = async () => {
    setIsRunning(true);
    setResults([]);
    setVisibleCount(0);
    setNeedsResim(false);

    try {
      let matchesToRun = [];

      if (scope === 'single') {
        if (!teamA || !teamB || teamA === teamB) {
          alert('Please select two different teams.');
          setIsRunning(false);
          return;
        }
        matchesToRun.push({ home: teamA, away: teamB });
        setActiveTeams([teamA, teamB]);
      } 
      else if (scope === 'group' || scope === 'date') {
        const d = await getGroupFixtures();
        matchesToRun = d.fixtures || [];
        if (scope === 'date' && startDate && endDate) {
          matchesToRun = matchesToRun.filter(m => m.date >= startDate && m.date <= endDate);
        }
        const tms = new Set();
        matchesToRun.forEach(m => { tms.add(m.home); tms.add(m.away); });
        setActiveTeams(Array.from(tms).sort());
      }
      else if (scope === 'r32' || scope === 'r16') {
        if (!tourneyState || !tourneyState.fixtures || tourneyState.stage === 'not_started') {
          alert('Tournament not started or reached this stage yet.');
          setIsRunning(false);
          return;
        }
        matchesToRun = tourneyState.fixtures[scope] || [];
        // Only run unplayed or just grab them all? Let's just grab all pairings
        matchesToRun = matchesToRun.map(m => ({ home: m.home, away: m.away }));
        const tms = new Set();
        matchesToRun.forEach(m => { tms.add(m.home); tms.add(m.away); });
        setActiveTeams(Array.from(tms).sort());
      }

      if (matchesToRun.length === 0) {
        setIsRunning(false);
        return;
      }

      const res = await simulateBatch(matchesToRun, simsCount);
      setResults(res.results || []);
      // Trigger first card
      setVisibleCount(1);
    } catch (e) {
      console.error(e);
      alert('Error running simulation');
    } finally {
      setIsRunning(false);
    }
  };

  const handleResimulate = async () => {
    setIsRunning(true);
    setNeedsResim(false);
    try {
      // Re-run the matches that haven't been shown yet
      const remainingMatches = results.slice(visibleCount - 1).map(r => ({ home: r.home, away: r.away }));
      if (remainingMatches.length === 0) {
        setIsRunning(false);
        return;
      }
      const res = await simulateBatch(remainingMatches, simsCount);
      // Replace the tail of the results array
      setResults(prev => [
        ...prev.slice(0, visibleCount - 1),
        ...(res.results || [])
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  };

  const handleInjuryChange = async () => {
    // Reload squads to get updated injury states
    await loadSquads();
    if (results.length > visibleCount) {
      setNeedsResim(true);
    }
  };

  // ── Bracket View Logic ──

  const renderGroupPill = (groupName) => {
    if (!tourneyState || !tourneyState.standings) return null;
    const g = tourneyState.standings[groupName] || [];
    return (
      <div className="bracket-group-panel card">
        <div className="bg-header">Group {groupName}</div>
        <div className="bg-teams">
          {g.map(t => (
            <div key={t.team} className="bg-team">
              <span>{t.team}</span>
              <span className="pts">{t.pts} pts</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSlot = (stage, index) => {
    if (!tourneyState || !tourneyState.fixtures || !tourneyState.fixtures[stage]) {
      return (
        <div className="bracket-slot empty">
          <div className="bs-team">TBD</div>
          <div className="bs-team">TBD</div>
        </div>
      );
    }
    const match = tourneyState.fixtures[stage][index];
    if (!match) {
      return (
        <div className="bracket-slot empty">
          <div className="bs-team">TBD</div>
          <div className="bs-team">TBD</div>
        </div>
      );
    }

    const isPlayed = match.played;
    const hw = match.winner === match.home;
    const aw = match.winner === match.away;

    return (
      <div className={`bracket-slot ${isPlayed ? 'played' : 'active'}`}>
        <div className={`bs-team ${hw ? 'winner' : ''}`}>
          <span className="name">{match.home || 'TBD'}</span>
          <span className="score">{isPlayed ? match.home_goals : '-'}</span>
        </div>
        <div className={`bs-team ${aw ? 'winner' : ''}`}>
          <span className="name">{match.away || 'TBD'}</span>
          <span className="score">{isPlayed ? match.away_goals : '-'}</span>
        </div>
      </div>
    );
  };

  // Render Bracket Side
  const renderBracketSide = (sideGroups, r32Indices, r16Indices, qfIndices, sfIndex) => (
    <div className="bracket-side">
      {/* Groups Col */}
      <div className="bracket-col col-groups">
        {sideGroups.map(g => renderGroupPill(g))}
      </div>
      {/* R32 Col */}
      <div className="bracket-col col-r32">
        {r32Indices.map(i => renderSlot('r32', i))}
      </div>
      {/* R16 Col */}
      <div className="bracket-col col-r16">
        {r16Indices.map(i => renderSlot('r16', i))}
      </div>
      {/* QF Col */}
      <div className="bracket-col col-qf">
        {qfIndices.map(i => renderSlot('qf', i))}
      </div>
      {/* SF Col */}
      <div className="bracket-col col-sf">
        {renderSlot('sf', sfIndex)}
      </div>
    </div>
  );

  return (
    <main className="predictor-page page">
      <div className="page-header">
        <div className="container page-header-content">
          <div className="section-tag" style={{ color: 'var(--lime)', marginBottom: 16 }}>
            <div className="section-tag-line" style={{ background: 'var(--lime)' }} />
            <span className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>FIFA WC 2026</span>
          </div>
          <h1>Match <span>Predictor</span></h1>
          <p className="text-muted mt-8">
            Monte Carlo engine with 5000+ sims per match. Watch the results flow in EA-style.
          </p>

          <div className="sim-page-tabs mt-24">
            <button className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => setActiveTab('simulator')}>Simulator</button>
            <button className={`tab-btn ${activeTab === 'bracket' ? 'active' : ''}`} onClick={() => setActiveTab('bracket')}>Bracket View</button>
          </div>
        </div>
      </div>

      <div className="container mt-32">
        {activeTab === 'simulator' && (
          <div className="sim-layout">
            <div className="sim-main">
              {/* Controls */}
              <div className="sim-controls card-elevated">
                <div className="scope-tabs mb-16">
                  {['single', 'group', 'r32', 'r16', 'date'].map(s => (
                    <button key={s} className={`chip ${scope === s ? 'active' : ''}`} onClick={() => setScope(s)}>
                      {s === 'single' ? 'Single Match' :
                       s === 'group'  ? 'Group Stage' :
                       s === 'r32'    ? 'Round of 32' :
                       s === 'r16'    ? 'Round of 16' : 'Date Range'}
                    </button>
                  ))}
                </div>

                {scope === 'single' && (
                  <div className="row gap-16 mb-16">
                    <select className="form-control" value={teamA} onChange={e => setTeamA(e.target.value)}>
                      <option value="">Home Team</option>
                      {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-muted">vs</span>
                    <select className="form-control" value={teamB} onChange={e => setTeamB(e.target.value)}>
                      <option value="">Away Team</option>
                      {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}

                {scope === 'date' && (
                  <div className="row gap-16 mb-16">
                    <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-muted">to</span>
                    <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                )}

                <div className="row justify-between mt-16">
                  <div className="form-group" style={{ width: 200 }}>
                    <label className="form-label">Iterations per match</label>
                    <select className="form-control" value={simsCount} onChange={e => setSimsCount(Number(e.target.value))}>
                      <option value={1000}>1,000 Sims</option>
                      <option value={2500}>2,500 Sims</option>
                      <option value={5000}>5,000 Sims</option>
                      <option value={10000}>10,000 Sims</option>
                    </select>
                  </div>
                  
                  <button className="btn btn-primary btn-lg" onClick={handleRunSim} disabled={isRunning}>
                    {isRunning ? <><div className="spinner" /> Running...</> : 'Run Simulation'}
                  </button>
                </div>
              </div>

              {/* Feed */}
              {results.length > 0 && (
                <div className="match-card-feed mt-24">
                  {results.slice(0, visibleCount).map((res, i) => (
                    <MatchCard 
                      key={`${res.home}-${res.away}-${i}`} 
                      match={res} 
                      onComplete={() => {
                        if (i === visibleCount - 1 && visibleCount < results.length && !needsResim) {
                          setVisibleCount(v => v + 1);
                        }
                      }}
                    />
                  ))}
                  
                  {visibleCount < results.length && !needsResim && (
                    <div className="center mt-16"><div className="spinner" /></div>
                  )}

                  {needsResim && (
                    <div className="center mt-24">
                      <button className="btn btn-lime btn-lg" onClick={handleResimulate}>
                        Squad Changed — Re-simulate Remaining
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="sim-sidebar">
              {results.length > 0 && (
                <InjuryPanel 
                  teams={activeTeams} 
                  squads={squads} 
                  onInjuryChange={handleInjuryChange} 
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'bracket' && (
          <div className="bracket-container card-elevated">
            {!tourneyState || tourneyState.stage === 'not_started' ? (
              <div className="center p-32">
                <h3 className="mb-16">Tournament Not Started</h3>
                <button className="btn btn-primary" onClick={async () => {
                  await startTournament();
                  await checkTourney();
                }}>Start New Tournament</button>
              </div>
            ) : (
              <div className="bracket-layout">
                {/* LEFT SIDE: Groups A, C, E, G, I, K */}
                {renderBracketSide(['A','C','E','G','I','K'], [0,2,4,6,8,10,12,14], [0,2,4,6], [0,2], 0)}

                {/* CENTRE: Final */}
                <div className="bracket-col col-final">
                  <div className="trophy-icon">🏆</div>
                  {renderSlot('final', 0)}
                  <div className="final-label">WORLD CHAMPION</div>
                </div>

                {/* RIGHT SIDE: Groups B, D, F, H, J, L */}
                {renderBracketSide(['B','D','F','H','J','L'], [1,3,5,7,9,11,13,15], [1,3,5,7], [1,3], 1)}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
