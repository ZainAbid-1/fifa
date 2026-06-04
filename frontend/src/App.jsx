import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import SquadsPage from './pages/SquadsPage';
import TournamentSimulator from './pages/TournamentSimulator';
import MatchPredictor from './pages/MatchPredictor';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"           element={<LandingPage />} />
        <Route path="/squads"     element={<SquadsPage />} />
        <Route path="/simulator"  element={<TournamentSimulator />} />
        <Route path="/predictor"  element={<MatchPredictor />} />
      </Routes>
    </BrowserRouter>
  );
}
