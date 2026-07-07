import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import GoogleAuthBridge from './components/GoogleAuthBridge.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <GoogleAuthBridge>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GoogleAuthBridge>
    </LanguageProvider>
  </StrictMode>,
)
