import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import ExplorePage from './pages/ExplorePage.jsx'
import PlaceDetailPage from './pages/PlaceDetailPage.jsx'
import HomePage from './pages/HomePage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import ItineraryPage from './pages/ItineraryPage.jsx'
import TripsPage from './pages/TripsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import TermsPage from './pages/TermsPage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import JoinTripPage from './pages/JoinTripPage.jsx'
import HeritagePage from './pages/HeritagePage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import { ChatProvider } from './context/ChatContext.jsx'
import ConciergeWidget from './components/concierge/ConciergeWidget.jsx'

function AppRoutes() {
  const location = useLocation()
  const isAuthModal =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/forgot-password' ||
    location.pathname.startsWith('/reset-password/')
  const background = isAuthModal ? location.state?.background : null
  const pageLocation = background ?? (isAuthModal ? { pathname: '/' } : location)

  return (
    <>
      <Routes location={pageLocation}>
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/place/:id" element={<PlaceDetailPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/itinerary" element={<ItineraryPage />} />
        <Route path="/itinerary/trip/:tripId" element={<ItineraryPage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/heritage" element={<HeritagePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/join/:code" element={<JoinTripPage />} />
      </Routes>

      {isAuthModal && (
        <Routes location={location}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        </Routes>
      )}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ChatProvider>
        <AppRoutes />
        <ConciergeWidget />
      </ChatProvider>
    </BrowserRouter>
  )
}

export default App
