import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import SquadsPage from './pages/SquadsPage';
import TournamentSimulator from './pages/TournamentSimulator';
import MatchPredictor from './pages/MatchPredictor';
import SimulationDashboard from './pages/SimulationDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/squads" element={<SquadsPage />} />
        <Route path="/dashboard" element={<SimulationDashboard />} />
        <Route path="/simulator" element={<TournamentSimulator />} />
        <Route path="/predictor" element={<MatchPredictor />} />
      </Routes>
      <Analytics />
    </BrowserRouter>
  );
}
