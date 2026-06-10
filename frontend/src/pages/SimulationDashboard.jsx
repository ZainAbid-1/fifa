import { useState, useMemo } from "react";

// ── FLAG MAP ──────────────────────────────────────────────────────────
const FLAG_MAP = {
    "France": "fr", "Germany": "de", "Spain": "es", "England": "gb-eng", "Portugal": "pt",
    "Netherlands": "nl", "Belgium": "be", "Croatia": "hr", "Austria": "at", "Czech Republic": "cz",
    "Serbia": "rs", "Switzerland": "ch", "Denmark": "dk", "Sweden": "se", "Norway": "no",
    "Turkey": "tr", "Scotland": "gb-sct", "Ukraine": "ua", "Bosnia & Herzegovina": "ba", "Slovakia": "sk",
    "Brazil": "br", "Argentina": "ar", "Colombia": "co", "Uruguay": "uy", "Ecuador": "ec",
    "Chile": "cl", "Paraguay": "py", "Bolivia": "bo", "Venezuela": "ve", "Peru": "pe",
    "Morocco": "ma", "Senegal": "sn", "Algeria": "dz", "Egypt": "eg", "Ghana": "gh",
    "Ivory Coast": "ci", "Cameroon": "cm", "Tunisia": "tn", "Nigeria": "ng", "South Africa": "za",
    "DR Congo": "cd", "Cape Verde": "cv",
    "United States": "us", "Mexico": "mx", "Canada": "ca", "Jamaica": "jm",
    "Haiti": "ht", "Panama": "pa", "Curacao": "cw", "Curaçao": "cw",
    "Japan": "jp", "South Korea": "kr", "Iran": "ir", "Saudi Arabia": "sa", "Australia": "au",
    "Qatar": "qa", "Iraq": "iq", "Jordan": "jo", "Uzbekistan": "uz", "New Zealand": "nz",
    "Italy": "it", "Wales": "gb-wls", "Mali": "ml",
};

function flagUrl(team) {
    const code = FLAG_MAP[team];
    if (!code) return null;
    return `https://flagcdn.com/w320/${code}.png`;
}

const RAW = [
    { rank: 1, team: "Spain", group: "H", elo: 1876, win: 7.52, final: 12.24, sf: 20.25, qf: 32.52, r16: 53.49, advance: 81.90 },
    { rank: 2, team: "France", group: "I", elo: 1877, win: 7.35, final: 12.35, sf: 19.91, qf: 33.42, r16: 54.96, advance: 88.83 },
    { rank: 3, team: "Argentina", group: "J", elo: 1875, win: 6.32, final: 11.15, sf: 18.41, qf: 31.12, r16: 51.17, advance: 83.32 },
    { rank: 4, team: "Brazil", group: "C", elo: 1761, win: 6.31, final: 11.61, sf: 19.70, qf: 32.56, r16: 51.99, advance: 82.29 },
    { rank: 5, team: "Portugal", group: "K", elo: 1764, win: 5.65, final: 10.23, sf: 18.54, qf: 31.95, r16: 54.04, advance: 87.63 },
    { rank: 6, team: "Germany", group: "E", elo: 1731, win: 5.50, final: 9.68, sf: 16.91, qf: 29.39, r16: 50.20, advance: 78.42 },
    { rank: 7, team: "England", group: "L", elo: 1826, win: 5.39, final: 9.49, sf: 16.57, qf: 29.18, r16: 49.69, advance: 84.88 },
    { rank: 8, team: "Belgium", group: "G", elo: 1735, win: 4.94, final: 8.85, sf: 16.98, qf: 32.44, r16: 55.85, advance: 89.33 },
    { rank: 9, team: "Netherlands", group: "F", elo: 1758, win: 4.45, final: 7.80, sf: 14.37, qf: 25.98, r16: 46.37, advance: 75.98 },
    { rank: 10, team: "Uruguay", group: "H", elo: 1673, win: 4.02, final: 7.88, sf: 15.31, qf: 28.43, r16: 54.29, advance: 90.49 },
    { rank: 11, team: "Colombia", group: "K", elo: 1693, win: 3.48, final: 6.46, sf: 12.67, qf: 23.52, r16: 41.91, advance: 76.98 },
    { rank: 12, team: "Morocco", group: "C", elo: 1756, win: 2.94, final: 6.14, sf: 12.17, qf: 23.76, r16: 44.05, advance: 78.53 },
    { rank: 13, team: "Mexico", group: "A", elo: 1684, win: 2.56, final: 6.06, sf: 12.58, qf: 25.02, r16: 47.49, advance: 90.35 },
    { rank: 14, team: "Croatia", group: "L", elo: 1717, win: 2.37, final: 5.12, sf: 10.20, qf: 20.34, r16: 37.61, advance: 71.59 },
    { rank: 15, team: "United States", group: "D", elo: 1676, win: 2.15, final: 4.68, sf: 9.80, qf: 20.22, r16: 44.57, advance: 87.76 },
    { rank: 16, team: "South Korea", group: "A", elo: 1590, win: 1.89, final: 4.13, sf: 7.91, qf: 15.80, r16: 31.94, advance: 62.78 },
    { rank: 17, team: "Switzerland", group: "B", elo: 1651, win: 1.85, final: 3.89, sf: 7.86, qf: 15.29, r16: 29.79, advance: 54.13 },
    { rank: 18, team: "Norway", group: "I", elo: 1551, win: 1.82, final: 3.99, sf: 7.75, qf: 17.25, r16: 36.10, advance: 75.07 },
    { rank: 19, team: "Canada", group: "B", elo: 1556, win: 1.69, final: 3.91, sf: 8.90, qf: 21.28, r16: 47.40, advance: 95.64 },
    { rank: 20, team: "Ecuador", group: "E", elo: 1596, win: 1.60, final: 3.78, sf: 8.60, qf: 18.14, r16: 38.51, advance: 78.03 },
    { rank: 21, team: "Senegal", group: "I", elo: 1686, win: 1.47, final: 3.39, sf: 7.03, qf: 14.23, r16: 28.60, advance: 58.52 },
    { rank: 22, team: "Egypt", group: "G", elo: 1566, win: 1.41, final: 3.25, sf: 8.43, qf: 17.43, r16: 37.71, advance: 76.90 },
    { rank: 23, team: "Sweden", group: "F", elo: 1515, win: 1.35, final: 3.15, sf: 6.37, qf: 14.12, r16: 28.31, advance: 60.50 },
    { rank: 24, team: "Turkey", group: "D", elo: 1599, win: 1.30, final: 3.35, sf: 8.14, qf: 17.40, r16: 37.45, advance: 70.50 },
    { rank: 25, team: "Scotland", group: "C", elo: 1500, win: 1.27, final: 3.27, sf: 7.90, qf: 16.94, r16: 36.18, advance: 74.57 },
    { rank: 26, team: "Japan", group: "F", elo: 1662, win: 1.23, final: 2.83, sf: 6.14, qf: 13.45, r16: 28.20, advance: 55.24 },
    { rank: 27, team: "Ivory Coast", group: "E", elo: 1533, win: 1.20, final: 3.02, sf: 7.17, qf: 15.89, r16: 33.77, advance: 70.48 },
    { rank: 28, team: "Austria", group: "J", elo: 1593, win: 1.14, final: 2.70, sf: 6.23, qf: 13.51, r16: 27.81, advance: 62.00 },
    { rank: 29, team: "Iran", group: "G", elo: 1616, win: 0.98, final: 2.43, sf: 5.88, qf: 13.25, r16: 26.66, advance: 54.76 },
    { rank: 30, team: "Algeria", group: "J", elo: 1564, win: 0.98, final: 2.21, sf: 4.93, qf: 11.49, r16: 24.38, advance: 57.77 },
    { rank: 31, team: "Czech Republic", group: "A", elo: 1503, win: 0.91, final: 1.93, sf: 4.88, qf: 11.02, r16: 24.18, advance: 55.78 },
    { rank: 32, team: "Bosnia & Herzegovina", group: "B", elo: 1385, win: 0.71, final: 1.69, sf: 4.22, qf: 10.30, r16: 25.23, advance: 57.69 },
    { rank: 33, team: "Tunisia", group: "F", elo: 1483, win: 0.70, final: 2.12, sf: 5.09, qf: 13.05, r16: 31.78, advance: 78.28 },
    { rank: 34, team: "Paraguay", group: "D", elo: 1504, win: 0.63, final: 1.56, sf: 4.43, qf: 10.94, r16: 26.83, advance: 59.24 },
    { rank: 35, team: "Saudi Arabia", group: "H", elo: 1421, win: 0.58, final: 1.52, sf: 3.98, qf: 8.86, r16: 21.51, advance: 51.34 },
    { rank: 36, team: "South Africa", group: "A", elo: 1429, win: 0.49, final: 1.20, sf: 3.25, qf: 8.50, r16: 23.29, advance: 59.60 },
    { rank: 37, team: "Qatar", group: "B", elo: 1454, win: 0.48, final: 1.11, sf: 2.99, qf: 7.53, r16: 21.50, advance: 53.51 },
    { rank: 38, team: "Panama", group: "L", elo: 1541, win: 0.45, final: 1.11, sf: 3.03, qf: 8.68, r16: 24.66, advance: 67.73 },
    { rank: 39, team: "Curaçao", group: "E", elo: 1294, win: 0.41, final: 1.05, sf: 2.70, qf: 6.57, r16: 16.11, advance: 43.11 },
    { rank: 40, team: "DR Congo", group: "K", elo: 1478, win: 0.40, final: 1.13, sf: 3.00, qf: 7.63, r16: 18.88, advance: 50.83 },
    { rank: 41, team: "Jordan", group: "J", elo: 1391, win: 0.39, final: 0.99, sf: 2.70, qf: 7.95, r16: 21.02, advance: 63.84 },
    { rank: 42, team: "Cape Verde", group: "H", elo: 1366, win: 0.33, final: 0.78, sf: 2.05, qf: 5.46, r16: 13.92, advance: 38.14 },
    { rank: 43, team: "Iraq", group: "I", elo: 1447, win: 0.26, final: 0.71, sf: 1.73, qf: 5.25, r16: 14.60, advance: 42.72 },
    { rank: 44, team: "Australia", group: "D", elo: 1579, win: 0.26, final: 0.94, sf: 3.12, qf: 8.11, r16: 19.97, advance: 46.24 },
    { rank: 45, team: "Uzbekistan", group: "K", elo: 1465, win: 0.25, final: 0.70, sf: 2.02, qf: 6.43, r16: 17.05, advance: 46.74 },
    { rank: 46, team: "Ghana", group: "L", elo: 1346, win: 0.25, final: 0.98, sf: 2.70, qf: 6.79, r16: 17.31, advance: 46.41 },
    { rank: 47, team: "New Zealand", group: "G", elo: 1281, win: 0.25, final: 0.86, sf: 2.73, qf: 6.80, r16: 18.07, advance: 45.54 },
    { rank: 48, team: "Haiti", group: "C", elo: 1291, win: 0.12, final: 0.58, sf: 1.77, qf: 4.81, r16: 13.60, advance: 38.09 },
];

const CONF = {
    UEFA: ["Spain", "France", "Germany", "England", "Belgium", "Netherlands", "Switzerland",
        "Norway", "Sweden", "Turkey", "Scotland", "Croatia", "Czech Republic", "Austria",
        "Bosnia & Herzegovina", "Serbia", "Denmark", "Poland", "Albania", "Slovenia"],
    CONMEBOL: ["Argentina", "Brazil", "Uruguay", "Colombia", "Ecuador", "Paraguay", "Chile", "Bolivia", "Peru", "Venezuela"],
    CAF: ["Morocco", "Senegal", "Egypt", "Ivory Coast", "Tunisia", "South Africa", "DR Congo", "Algeria", "Cape Verde", "Ghana", "Cameroon", "Nigeria"],
    CONCACAF: ["United States", "Mexico", "Canada", "Panama", "Curaçao", "Haiti", "Jamaica"],
    AFC: ["South Korea", "Japan", "Iran", "Saudi Arabia", "Australia", "Uzbekistan", "Jordan", "Iraq", "New Zealand"],
};

function getConf(team) {
    for (const [c, list] of Object.entries(CONF)) if (list.includes(team)) return c;
    return "Other";
}

function barColor(pct) {
    if (pct > 60) return "var(--lime)";
    if (pct > 30) return "#66d9ff";
    return "#4a8fff";
}

const maxWin = Math.max(...RAW.map(d => d.win));
const GROUPS = [...new Set(RAW.map(d => d.group))].sort();

function FlagImg({ team, width = 28, className = "" }) {
    const url = flagUrl(team);
    if (!url) return <span style={{ width, height: Math.round(width * 0.625), display: "inline-block", background: "#333", borderRadius: 2 }} />;
    return (
        <img
            src={url}
            alt={team}
            width={width}
            height={Math.round(width * 0.625)}
            className={className}
            style={{ objectFit: "cover", borderRadius: 2, display: "inline-block", flexShrink: 0 }}
        />
    );
}

function BarCell({ value, max }) {
    const pct = (value / max) * 100;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: barColor(pct) }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", width: 38, textAlign: "right" }}>{value.toFixed(1)}%</span>
        </div>
    );
}

function TeamModal({ team, onClose }) {
    const d = RAW.find(r => r.team === team);
    if (!d) return null;
    const stages = [
        { label: "Round of 16", val: d.r16, color: "#4a8fff" },
        { label: "Quarter-Final", val: d.qf, color: "#66d9ff" },
        { label: "Semi-Final", val: d.sf, color: "#a0e0ff" },
        { label: "Final", val: d.final, color: "#ffd700" },
        { label: "Champion", val: d.win, color: "var(--lime)" },
    ];
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-card">
                <div className="modal-top">
                    <FlagImg team={d.team} width={72} />
                    <div style={{ flex: 1 }}>
                        <div className="modal-team-name">{d.team}</div>
                        <div className="modal-meta">
                            <span>Group {d.group}</span>
                            <span>ELO {d.elo.toFixed(0)}</span>
                            <span>Rank #{d.rank}</span>
                            <span>{getConf(d.team)}</span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="modal-stat-grid">
                        <div className="modal-stat-box highlight">
                            <div className="msb-num">{d.win.toFixed(1)}%</div>
                            <div className="msb-lbl">Champion</div>
                        </div>
                        <div className="modal-stat-box">
                            <div className="msb-num">{d.final.toFixed(1)}%</div>
                            <div className="msb-lbl">Reach Final</div>
                        </div>
                        <div className="modal-stat-box">
                            <div className="msb-num">{d.sf.toFixed(1)}%</div>
                            <div className="msb-lbl">Reach Semi-Final</div>
                        </div>
                        <div className="modal-stat-box">
                            <div className="msb-num">{d.qf.toFixed(1)}%</div>
                            <div className="msb-lbl">Reach Quarter-Final</div>
                        </div>
                        <div className="modal-stat-box">
                            <div className="msb-num">{d.r16.toFixed(1)}%</div>
                            <div className="msb-lbl">Reach Round of 16</div>
                        </div>
                        <div className="modal-stat-box">
                            <div className="msb-num">{d.advance.toFixed(1)}%</div>
                            <div className="msb-lbl">Advance from Group</div>
                        </div>
                    </div>
                    <div className="modal-progress-section">
                        <div className="mp-label">Stage Probabilities</div>
                        {stages.map(s => (
                            <div className="mp-row" key={s.label}>
                                <span className="mp-name">{s.label}</span>
                                <div className="mp-track">
                                    <div className="mp-fill" style={{ width: `${s.val}%`, background: s.color }} />
                                </div>
                                <span className="mp-val">{s.val.toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@400;500;600&family=Share+Tech+Mono&display=swap');

:root {
    --bg-deep: #0a0c10;
    --bg-card: #111318;
    --bg-card2: #15181f;
    --bg-row-alt: #13161c;
    --border: rgba(255,255,255,0.07);
    --lime: #c8ff00;
    --lime-dim: rgba(200,255,0,0.12);
    --lime-glow: rgba(200,255,0,0.25);
    --red: #e8003d;
    --gold: #ffd700;
    --silver: #c0c0c0;
    --bronze: #cd7f32;
    --text-primary: #f0f2f5;
    --text-muted: #6a7080;
    --text-dim: #3a3f4a;
    --font-display: 'Barlow Condensed', sans-serif;
    --font-body: 'Barlow', sans-serif;
    --font-mono: 'Share Tech Mono', monospace;
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--bg-deep); color: var(--text-primary); font-family: var(--font-body); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-deep); }
::-webkit-scrollbar-thumb { background: var(--text-dim); border-radius: 3px; }

.sim-app { min-height: 100vh; }

/* ── HERO ── */
.hero {
    position: relative;
    background: linear-gradient(135deg, #0a0c10 0%, #0d1020 60%, #0a0c10 100%);
    overflow: hidden;
    text-align: left;
}
.hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 80% 100% at 80% 50%, rgba(200,255,0,0.04) 0%, transparent 70%);
    pointer-events: none;
}
.hero-grid-bg {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
    background-size: 60px 60px;
    opacity: 0.3;
    pointer-events: none;
}

.hero-content {
    position: relative;
    z-index: 1;
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
    padding: 28px 24px 24px;
}

.hero-title {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(48px, 7vw, 96px);
    line-height: 0.88;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    margin-bottom: 16px;
    display: block;
    white-space: normal;
}
.hero-title em { font-style: italic; color: var(--lime); }

.hero-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    overflow: hidden;
    width: fit-content;
    max-width: 100%;
}
.hero-stat {
    padding: 14px 24px;
    border-right: 1px solid var(--border);
    text-align: left;
}
.hero-stat:last-child { border-right: none; }
.hero-stat-num {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 28px;
    line-height: 1;
    color: var(--lime);
}
.hero-stat-label {
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-top: 2px;
}

/* ── TICKER ── */
.ticker-wrapper {
    position: relative;
    z-index: 1;
    background: #060810;
    border-top: 1px solid rgba(200,255,0,0.15);
    border-bottom: 3px solid var(--lime);
    overflow: hidden;
    height: 48px;
    display: flex;
    align-items: center;
    box-shadow: 0 4px 24px rgba(200,255,0,0.12);
}
.ticker-label {
    background: var(--lime);
    color: #000;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 13px;
    letter-spacing: 0.18em;
    padding: 0 20px;
    height: 100%;
    display: flex;
    align-items: center;
    white-space: nowrap;
    flex-shrink: 0;
    text-transform: uppercase;
    gap: 8px;
}
.ticker-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #000;
    animation: blink 1s ease-in-out infinite;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
.ticker-scroll { overflow: hidden; flex: 1; }
.ticker-track { display: flex; animation: ticker 55s linear infinite; white-space: nowrap; }
.ticker-track:hover { animation-play-state: paused; }
.ticker-item { font-family: var(--font-display); font-weight: 700; font-size: 15px; letter-spacing: 0.07em; padding: 0 24px; color: #fff; text-transform: uppercase; }
.ticker-item .ti-pct { color: var(--lime); margin-left: 6px; font-weight: 900; font-size: 16px; }
.ticker-item .ti-sep { color: #333; margin: 0 4px; }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* ── NAV TABS ── */
.nav-bar {
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
}
.nav-inner {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    padding: 0 24px;
    overflow-x: auto;
    scrollbar-width: none;
}
.nav-inner::-webkit-scrollbar { display: none; }
.nav-tab {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 16px 20px;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: color 0.2s, border-color 0.2s;
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    white-space: nowrap;
    flex-shrink: 0;
}
.nav-tab:hover { color: var(--text-primary); }
.nav-tab.active { color: var(--lime); border-bottom-color: var(--lime); }

/* ── PAGE ── */
.page-body { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }

/* ── SECTION HEADER ── */
.section-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.section-title { font-family: var(--font-display); font-weight: 900; font-size: 28px; text-transform: uppercase; letter-spacing: 0.02em; }
.section-title em { color: var(--lime); font-style: italic; }
.section-count { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); background: var(--bg-card2); padding: 2px 8px; border-radius: 2px; border: 1px solid var(--border); }

/* ── PODIUM ── */
.podium-section { margin-bottom: 48px; }
.podium-grid {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    gap: 12px;
    align-items: end;
    margin-bottom: 12px;
}
.podium-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 24px 20px 20px;
    text-align: center;
    position: relative;
    transition: transform 0.2s;
    cursor: pointer;
}
.podium-card:hover { transform: translateY(-3px); }
.podium-card.p1 { border-color: var(--lime); box-shadow: 0 0 40px rgba(200,255,0,0.12), inset 0 0 40px rgba(200,255,0,0.03); padding-top: 32px; }
.podium-card.p2 { border-color: rgba(192,192,192,0.3); }
.podium-card.p3 { border-color: rgba(205,127,50,0.3); }
.podium-medal { font-family: var(--font-display); font-weight: 900; font-size: 13px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 12px; }
.p1 .podium-medal { color: var(--lime); }
.p2 .podium-medal { color: var(--silver); }
.p3 .podium-medal { color: var(--bronze); }
.podium-flag-wrap { display: flex; justify-content: center; margin-bottom: 10px; }
.podium-flag-wrap img { border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.podium-name { font-family: var(--font-display); font-weight: 900; font-size: 22px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
.podium-pct { font-family: var(--font-display); font-weight: 700; font-size: 38px; line-height: 1; margin: 8px 0 4px; }
.p1 .podium-pct { color: var(--lime); }
.p2 .podium-pct { color: var(--silver); }
.p3 .podium-pct { color: var(--bronze); }
.podium-label { font-family: var(--font-display); font-size: 11px; font-weight: 600; letter-spacing: 0.15em; color: var(--text-muted); text-transform: uppercase; }
.podium-elo { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 10px; }
.podium-pill-row { display: flex; justify-content: center; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.pill { font-family: var(--font-mono); font-size: 10px; padding: 3px 8px; border-radius: 2px; border: 1px solid var(--border); color: var(--text-muted); }
.pill span { color: var(--text-primary); }
.rank-badge { position: absolute; top: 10px; right: 10px; font-family: var(--font-display); font-weight: 900; font-size: 11px; letter-spacing: 0.1em; color: #000; background: var(--lime); padding: 2px 7px; border-radius: 2px; text-transform: uppercase; }

/* ── CONTENDERS ── */
.contenders-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
}
.contender-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px 10px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.2s;
    position: relative;
}
.contender-card:hover { border-color: rgba(200,255,0,0.4); transform: translateY(-2px); }
.contender-rank { position: absolute; top: 6px; left: 8px; font-family: var(--font-display); font-weight: 900; font-size: 10px; color: var(--text-muted); }
.contender-flag-wrap { display: flex; justify-content: center; margin-bottom: 6px; }
.contender-flag-wrap img { border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
.contender-name { font-family: var(--font-display); font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.contender-pct { font-family: var(--font-display); font-weight: 700; font-size: 18px; color: var(--lime); }

/* ── FILTER BAR ── */
.filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.search-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 14px; color: var(--text-primary); font-family: var(--font-body); font-size: 13px; width: 200px; max-width: 100%; outline: none; transition: border-color 0.2s; }
.search-box:focus { border-color: var(--lime); }
.search-box::placeholder { color: var(--text-dim); }
.filter-btn { font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.filter-btn:hover { color: var(--text-primary); border-color: rgba(255,255,255,0.2); }
.filter-btn.active { background: var(--lime); color: #000; border-color: var(--lime); }
.sort-select { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; color: var(--text-primary); font-family: var(--font-body); font-size: 12px; outline: none; cursor: pointer; }
.sort-select option { background: var(--bg-card); }

/* ── TABLE ── */
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-card); -webkit-overflow-scrolling: touch; }
.sim-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: 13px; min-width: 700px; }
.sim-table thead tr { background: var(--bg-card2); border-bottom: 2px solid rgba(200,255,0,0.25); }
.sim-table th { font-family: var(--font-display); font-weight: 700; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); padding: 13px 12px; text-align: left; white-space: nowrap; cursor: pointer; user-select: none; transition: color 0.15s; }
.sim-table th:hover { color: var(--lime); }
.sim-table th.sort-active { color: var(--lime); }
.sim-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s; cursor: pointer; }
.sim-table tbody tr:hover { background: var(--bg-row-alt); }
.sim-table tbody tr.highlighted { background: var(--lime-dim); }
.sim-table td { padding: 10px 12px; vertical-align: middle; white-space: nowrap; }
.td-rank { font-family: var(--font-display); font-weight: 900; font-size: 17px; color: var(--text-muted); width: 40px; }
.rank-1 { color: var(--lime) !important; }
.rank-2 { color: var(--silver) !important; }
.rank-3 { color: var(--bronze) !important; }
.td-team { min-width: 180px; }
.team-inner { display: flex; align-items: center; gap: 10px; }
.team-info { display: flex; flex-direction: column; }
.team-name { font-family: var(--font-display); font-weight: 700; font-size: 15px; letter-spacing: 0.02em; text-transform: uppercase; }
.team-group { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.td-elo { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
.td-pct { font-family: var(--font-display); font-weight: 700; font-size: 15px; text-align: right; }
.td-pct.win { color: var(--lime); font-size: 17px; }
.td-bar { width: 160px; }
.td-advance { font-family: var(--font-display); font-weight: 700; font-size: 14px; }
.adv-high { color: var(--lime) !important; }
.adv-mid { color: #8fc4ff !important; }

/* ── GROUPS ── */
.groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.group-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
.group-header { background: var(--bg-card2); border-bottom: 2px solid var(--lime); padding: 12px 18px; display: flex; align-items: center; gap: 12px; }
.group-letter { font-family: var(--font-display); font-weight: 900; font-size: 26px; color: var(--lime); line-height: 1; }
.group-label { font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: 0.15em; color: var(--text-muted); text-transform: uppercase; }
.group-team-row { display: grid; grid-template-columns: 28px 1fr auto auto; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s; cursor: pointer; }
.group-team-row:hover { background: var(--bg-row-alt); }
.gtr-name { font-family: var(--font-display); font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gtr-win { font-family: var(--font-display); font-weight: 700; font-size: 13px; color: var(--lime); text-align: right; }
.gtr-advance { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); text-align: right; white-space: nowrap; }
.gtr-bar { grid-column: 2 / 5; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: -6px; }
.gtr-bar-fill { height: 100%; background: var(--lime); border-radius: 2px; opacity: 0.5; }

/* ── CHART ── */
.chart-title { font-family: var(--font-display); font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 14px; }
.chart-title em { color: var(--lime); font-style: normal; }
.bar-chart { display: flex; flex-direction: column; gap: 6px; }
.bc-row { display: grid; grid-template-columns: 150px 1fr 52px; align-items: center; gap: 12px; cursor: pointer; }
.bc-label { font-family: var(--font-display); font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bc-flag-img { border-radius: 2px; flex-shrink: 0; }
.bc-track { height: 22px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
.bc-fill { height: 100%; border-radius: 2px; min-width: 4px; transition: width 0.8s cubic-bezier(.4,0,.2,1); }
.bc-pct { font-family: var(--font-display); font-weight: 700; font-size: 14px; color: var(--lime); text-align: right; }

/* ── MODAL ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease; }
.modal-card { background: var(--bg-card); border: 1px solid var(--lime); border-radius: var(--radius-lg); width: 100%; max-width: 540px; max-height: 92vh; overflow-y: auto; box-shadow: 0 0 60px rgba(200,255,0,0.15); animation: slideUp 0.25s ease; }
.modal-top { background: var(--bg-card2); padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; }
.modal-team-name { font-family: var(--font-display); font-weight: 900; font-size: 28px; text-transform: uppercase; letter-spacing: 0.03em; }
.modal-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; gap: 10px; flex-wrap: wrap; }
.modal-close { margin-left: auto; background: none; border: 1px solid var(--border); color: var(--text-muted); width: 32px; height: 32px; border-radius: var(--radius-sm); cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; }
.modal-close:hover { border-color: var(--red); color: var(--red); }
.modal-body { padding: 20px 24px; }
.modal-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.modal-stat-box { background: var(--bg-card2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 10px; text-align: center; }
.modal-stat-box.highlight { border-color: rgba(200,255,0,0.35); background: var(--lime-dim); }
.msb-num { font-family: var(--font-display); font-weight: 900; font-size: 26px; color: var(--lime); line-height: 1; }
.msb-lbl { font-family: var(--font-display); font-size: 10px; font-weight: 600; letter-spacing: 0.12em; color: var(--text-muted); text-transform: uppercase; margin-top: 4px; }
.modal-progress-section { margin-top: 8px; }
.mp-label { font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: 0.12em; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px; }
.mp-row { display: grid; grid-template-columns: 90px 1fr 44px; align-items: center; gap: 10px; margin-bottom: 8px; }
.mp-name { font-family: var(--font-display); font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; }
.mp-track { height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.mp-fill { height: 100%; border-radius: 4px; }
.mp-val { font-family: var(--font-display); font-weight: 700; font-size: 13px; color: var(--text-primary); text-align: right; }

/* ── ANIMATIONS ── */
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }

/* ── RESPONSIVE ── */
@media (max-width: 1024px) {
    .contenders-row { grid-template-columns: repeat(4, 1fr); }
    .podium-grid { gap: 8px; }
    .bc-row { grid-template-columns: 120px 1fr 44px; }
}

@media (max-width: 768px) {
    .hero-content { padding: 16px 16px 14px; }
    .hero-title { font-size: clamp(34px, 9vw, 56px); margin-bottom: 10px; }
    .hero-stats { width: 100%; }
    .hero-stat { padding: 8px 10px; }
    .hero-stat-num { font-size: 19px; }
    .hero-stat-label { font-size: 9px; letter-spacing: 0.08em; }
    .ticker-wrapper { height: 38px; }
    .ticker-label { padding: 0 12px; font-size: 11px; }
    .ticker-item { font-size: 13px; padding: 0 16px; }
    .page-body { padding: 14px 12px; }
    .nav-inner { padding: 0 12px; }
    .nav-tab { padding: 12px 10px; font-size: 11px; }
    .podium-grid { grid-template-columns: 1fr; max-width: 340px; margin-left: auto; margin-right: auto; align-items: start; }
    .podium-card.p1 { order: -1; }
    .podium-card.p2 { order: 0; }
    .podium-card.p3 { order: 1; }
    .contenders-row { grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .contender-name { font-size: 10px; }
    .contender-pct { font-size: 15px; }
    .bc-row { grid-template-columns: 100px 1fr 40px; gap: 8px; }
    .bc-label { font-size: 11px; }
    .section-title { font-size: 22px; }
    .modal-stat-grid { grid-template-columns: repeat(2, 1fr); }
    .modal-team-name { font-size: 22px; }
    .groups-grid { grid-template-columns: 1fr; }
    .filter-bar { gap: 6px; }
    .search-box { width: 100%; }
    .sort-select { width: 100%; }
}

@media (max-width: 480px) {
    .hero-content { padding: 14px 12px 12px; }
    .hero-title { font-size: clamp(26px, 10vw, 38px); margin-bottom: 8px; }
    .hero-stat-num { font-size: 16px; }
    .hero-stat-label { font-size: 8px; }
    .hero-stat { padding: 7px 8px; }
    .contenders-row { grid-template-columns: repeat(2, 1fr); }
    .bc-row { grid-template-columns: 90px 1fr 36px; }
    .bc-label { font-size: 10px; }
    .mp-row { grid-template-columns: 75px 1fr 40px; }
}
`;

export default function SimulationDashboard() {
    const [activeTab, setActiveTab] = useState("overview");
    const [search, setSearch] = useState("");
    const [confFilter, setConfFilter] = useState("ALL");
    const [sortKey, setSortKey] = useState("rank");
    const [sortDir, setSortDir] = useState(1);
    const [selectedTeam, setSelectedTeam] = useState(null);

    const tableData = useMemo(() => {
        let data = RAW.filter(d => {
            const matchSearch = d.team.toLowerCase().includes(search.toLowerCase());
            const matchConf = confFilter === "ALL" || getConf(d.team) === confFilter;
            return matchSearch && matchConf;
        });
        return [...data].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey];
            return (typeof av === "number" ? av - bv : av.localeCompare(bv)) * sortDir;
        });
    }, [search, confFilter, sortKey, sortDir]);

    function toggleSort(key) {
        if (sortKey === key) setSortDir(d => d * -1);
        else { setSortKey(key); setSortDir(-1); }
    }

    function SortTh({ col, label }) {
        const active = sortKey === col;
        return (
            <th className={active ? "sort-active" : ""} onClick={() => toggleSort(col)}>
                {label}<span style={{ marginLeft: 4, opacity: 0.6 }}>{active ? (sortDir === -1 ? " ↓" : " ↑") : " ↕"}</span>
            </th>
        );
    }

    const groupData = useMemo(() => {
        const g = {};
        RAW.forEach(d => { if (!g[d.group]) g[d.group] = []; g[d.group].push(d); });
        return g;
    }, []);

    const top3 = RAW.slice(0, 3);
    const contenders = RAW.slice(3, 10);

    const tickerItems = [
        ...RAW.slice(0, 10).map(d => ({ team: d.team, pct: d.win.toFixed(1) })),
        { sep: true, text: "48 TEAMS · 104 MATCHES" },
        { sep: true, text: "10,000 SIMULATIONS" },
        { sep: true, text: "FIFA WORLD CUP 2026" },
        { sep: true, text: "USA · CANADA · MEXICO" },
    ];
    const tickerDom = tickerItems.map((item, i) =>
        item.sep
            ? <span key={i} className="ticker-item" style={{ color: "var(--text-muted)" }}><span className="ti-sep">◆</span>{item.text}</span>
            : <span key={i} className="ticker-item"><span style={{ color: "var(--text-muted)" }}>{item.team}</span><span className="ti-pct">{item.pct}%</span></span>
    );

    return (
        <>
            <style>{styles}</style>
            <div className="sim-app">

                {/* ── HERO ── */}
                <div className="hero">
                    <div className="hero-grid-bg" />
                    <div className="hero-content">
                        <h1 className="hero-title">Simulation <em>Results</em></h1>
                        <div className="hero-stats">
                            {[
                                { num: "48", lbl: "Teams" },
                                { num: "104", lbl: "Matches" },
                                { num: "10K", lbl: "Simulations" },
                                { num: "12", lbl: "Groups" },
                                { num: "7.5%", lbl: "Top Win Prob" },
                            ].map(s => (
                                <div key={s.lbl} className="hero-stat">
                                    <div className="hero-stat-num">{s.num}</div>
                                    <div className="hero-stat-label">{s.lbl}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="ticker-wrapper">
                        <div className="ticker-label">
                            <span className="ticker-dot" />
                            LIVE ODDS
                        </div>
                        <div className="ticker-scroll">
                            <div className="ticker-track">
                                {tickerDom}
                                {tickerDom}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── NAV TABS ── */}
                <nav className="nav-bar">
                    <div className="nav-inner">
                        {[
                            { id: "overview", label: "Overview" },
                            { id: "rankings", label: "Full Rankings" },
                            { id: "groups", label: "Groups" },
                            { id: "chart", label: "Visual Chart" },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
                                onClick={() => setActiveTab(tab.id)}
                            >{tab.label}</button>
                        ))}
                    </div>
                </nav>

                {/* ── PAGE BODY ── */}
                <div className="page-body">

                    {/* OVERVIEW */}
                    {activeTab === "overview" && (
                        <>
                            <div className="podium-section">
                                <div className="section-header">
                                    <h2 className="section-title">Title <em>Contenders</em></h2>
                                    <span className="section-count">10,000 simulations</span>
                                </div>
                                <div className="podium-grid">
                                    <div className="podium-card p2" onClick={() => setSelectedTeam(top3[1].team)}>
                                        <div className="podium-medal">Runner-Up</div>
                                        <div className="podium-flag-wrap"><FlagImg team={top3[1].team} width={64} /></div>
                                        <div className="podium-name">{top3[1].team}</div>
                                        <div className="podium-pct">{top3[1].win.toFixed(1)}%</div>
                                        <div className="podium-label">Win Probability</div>
                                        <div className="podium-elo">ELO {top3[1].elo.toFixed(0)} · Group {top3[1].group}</div>
                                        <div className="podium-pill-row">
                                            <span className="pill">Final <span>{top3[1].final}%</span></span>
                                            <span className="pill">Semi <span>{top3[1].sf}%</span></span>
                                        </div>
                                    </div>
                                    <div className="podium-card p1" onClick={() => setSelectedTeam(top3[0].team)}>
                                        <div className="rank-badge">Favourite</div>
                                        <div className="podium-medal">Champion</div>
                                        <div className="podium-flag-wrap"><FlagImg team={top3[0].team} width={80} /></div>
                                        <div className="podium-name">{top3[0].team}</div>
                                        <div className="podium-pct">{top3[0].win.toFixed(1)}%</div>
                                        <div className="podium-label">Win Probability</div>
                                        <div className="podium-elo">ELO {top3[0].elo.toFixed(0)} · Group {top3[0].group}</div>
                                        <div className="podium-pill-row">
                                            <span className="pill">Final <span>{top3[0].final}%</span></span>
                                            <span className="pill">Semi <span>{top3[0].sf}%</span></span>
                                        </div>
                                    </div>
                                    <div className="podium-card p3" onClick={() => setSelectedTeam(top3[2].team)}>
                                        <div className="podium-medal">Third Favourite</div>
                                        <div className="podium-flag-wrap"><FlagImg team={top3[2].team} width={64} /></div>
                                        <div className="podium-name">{top3[2].team}</div>
                                        <div className="podium-pct">{top3[2].win.toFixed(1)}%</div>
                                        <div className="podium-label">Win Probability</div>
                                        <div className="podium-elo">ELO {top3[2].elo.toFixed(0)} · Group {top3[2].group}</div>
                                        <div className="podium-pill-row">
                                            <span className="pill">Final <span>{top3[2].final}%</span></span>
                                            <span className="pill">Semi <span>{top3[2].sf}%</span></span>
                                        </div>
                                    </div>
                                </div>
                                <div className="contenders-row" style={{ marginTop: 8 }}>
                                    {contenders.map((d, i) => (
                                        <div key={d.team} className="contender-card" onClick={() => setSelectedTeam(d.team)}>
                                            <span className="contender-rank">#{i + 4}</span>
                                            <div className="contender-flag-wrap"><FlagImg team={d.team} width={40} /></div>
                                            <div className="contender-name">{d.team}</div>
                                            <div className="contender-pct">{d.win.toFixed(1)}%</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 32 }}>
                                <div className="section-header">
                                    <h2 className="section-title">Win Probability — <em>Top 20</em></h2>
                                </div>
                                <div className="bar-chart">
                                    {RAW.slice(0, 20).map(d => (
                                        <div key={d.team} className="bc-row" onClick={() => setSelectedTeam(d.team)}>
                                            <div className="bc-label">
                                                <FlagImg team={d.team} width={22} className="bc-flag-img" />
                                                {d.team}
                                            </div>
                                            <div className="bc-track">
                                                <div className="bc-fill" style={{
                                                    width: `${(d.win / maxWin) * 100}%`,
                                                    background: d.rank === 1 ? "var(--lime)" : d.rank === 2 ? "var(--silver)" : d.rank === 3 ? "var(--bronze)" : "#4a8fff",
                                                }} />
                                            </div>
                                            <div className="bc-pct">{d.win.toFixed(1)}%</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* FULL RANKINGS */}
                    {activeTab === "rankings" && (
                        <>
                            <div className="section-header" style={{ marginBottom: 16 }}>
                                <h2 className="section-title">Full <em>Rankings</em></h2>
                                <span className="section-count">{tableData.length} teams</span>
                            </div>
                            <div className="filter-bar">
                                <input className="search-box" placeholder="Search nation..." value={search} onChange={e => setSearch(e.target.value)} />
                                {["ALL", "UEFA", "CONMEBOL", "CAF", "CONCACAF", "AFC"].map(c => (
                                    <button key={c} className={`filter-btn ${confFilter === c ? "active" : ""}`} onClick={() => setConfFilter(c)}>{c}</button>
                                ))}
                                <select className="sort-select" value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDir(-1); }}>
                                    <option value="rank">Sort: Overall Rank</option>
                                    <option value="win">Sort: Win %</option>
                                    <option value="elo">Sort: ELO Rating</option>
                                    <option value="advance">Sort: Advance %</option>
                                    <option value="final">Sort: Final %</option>
                                </select>
                            </div>
                            <div className="table-wrap">
                                <table className="sim-table">
                                    <thead>
                                        <tr>
                                            <SortTh col="rank" label="Rank" />
                                            <th>Team</th>
                                            <SortTh col="elo" label="ELO" />
                                            <SortTh col="win" label="Win %" />
                                            <SortTh col="final" label="Final %" />
                                            <SortTh col="sf" label="SF %" />
                                            <SortTh col="qf" label="QF %" />
                                            <SortTh col="r16" label="R16 %" />
                                            <SortTh col="advance" label="Advance %" />
                                            <th>Bar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableData.map(d => (
                                            <tr key={d.team} className={selectedTeam === d.team ? "highlighted" : ""} onClick={() => setSelectedTeam(d.team)}>
                                                <td className={`td-rank${d.rank <= 3 ? " rank-" + d.rank : ""}`}>{d.rank}</td>
                                                <td className="td-team">
                                                    <div className="team-inner">
                                                        <FlagImg team={d.team} width={30} />
                                                        <div className="team-info">
                                                            <span className="team-name">{d.team}</span>
                                                            <span className="team-group">Group {d.group} · {getConf(d.team)}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="td-elo">{d.elo.toFixed(0)}</td>
                                                <td className="td-pct win">{d.win.toFixed(2)}%</td>
                                                <td className="td-pct">{d.final.toFixed(1)}%</td>
                                                <td className="td-pct">{d.sf.toFixed(1)}%</td>
                                                <td className="td-pct">{d.qf.toFixed(1)}%</td>
                                                <td className="td-pct">{d.r16.toFixed(1)}%</td>
                                                <td className={`td-advance ${d.advance > 80 ? "adv-high" : d.advance > 60 ? "adv-mid" : ""}`}>{d.advance.toFixed(1)}%</td>
                                                <td className="td-bar"><BarCell value={d.advance} max={100} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* GROUPS */}
                    {activeTab === "groups" && (
                        <>
                            <div className="section-header" style={{ marginBottom: 16 }}>
                                <h2 className="section-title">Group <em>Breakdown</em></h2>
                                <span className="section-count">12 groups · 4 teams each</span>
                            </div>
                            <div className="groups-grid">
                                {GROUPS.map(g => {
                                    const teams = (groupData[g] || []).sort((a, b) => b.win - a.win);
                                    return (
                                        <div key={g} className="group-card">
                                            <div className="group-header">
                                                <div className="group-letter">{g}</div>
                                                <div className="group-label">Group {g}</div>
                                            </div>
                                            {teams.map(d => (
                                                <div key={d.team}>
                                                    <div className="group-team-row" onClick={() => setSelectedTeam(d.team)}>
                                                        <FlagImg team={d.team} width={24} />
                                                        <span className="gtr-name">{d.team}</span>
                                                        <span className="gtr-win">{d.win.toFixed(1)}%</span>
                                                        <span className="gtr-advance">{d.advance.toFixed(0)}% adv</span>
                                                    </div>
                                                    <div className="gtr-bar">
                                                        <div className="gtr-bar-fill" style={{ width: `${d.advance}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* CHART */}
                    {activeTab === "chart" && (
                        <>
                            <div className="section-header" style={{ marginBottom: 16 }}>
                                <h2 className="section-title">Visual <em>Chart</em></h2>
                            </div>
                            <div className="chart-title">Advance from Group Stage — <em>All 48 Teams</em></div>
                            <div className="bar-chart">
                                {[...RAW].sort((a, b) => b.advance - a.advance).map(d => (
                                    <div key={d.team} className="bc-row" onClick={() => setSelectedTeam(d.team)}>
                                        <div className="bc-label">
                                            <FlagImg team={d.team} width={22} className="bc-flag-img" />
                                            {d.team}
                                        </div>
                                        <div className="bc-track">
                                            <div className="bc-fill" style={{ width: `${d.advance}%`, background: barColor(d.advance) }} />
                                        </div>
                                        <div className="bc-pct">{d.advance.toFixed(0)}%</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {selectedTeam && <TeamModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />}
            </div>
        </>
    );
}