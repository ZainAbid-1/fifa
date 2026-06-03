import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import SquadsPage from './pages/SquadsPage'
import MatchPredictor from './pages/MatchPredictor'
import TournamentSimulator from './pages/TournamentSimulator'

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/squads" element={<SquadsPage />} />
        <Route path="/predictor" element={<MatchPredictor />} />
        <Route path="/simulator" element={<TournamentSimulator />} />
      </Routes>
    </>
  )
}
