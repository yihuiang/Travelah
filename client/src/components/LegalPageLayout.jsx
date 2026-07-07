import { Link } from 'react-router-dom'
import HomeFooter from './home/HomeFooter.jsx'
import '../styles/home-v2.css'
import '../styles/legal-v2.css'

export default function LegalPageLayout({ title, lastUpdated, children }) {
  return (
    <div className="home-v2 legal-v2">
      <header className="legal-header">
        <Link to="/" className="legal-logo">
          travelah
        </Link>
        <Link to="/" className="legal-back">
          Back to home
        </Link>
      </header>

      <main className="legal-main">
        <article className="legal-article">
          <p className="legal-eyebrow">Legal</p>
          <h1>{title}</h1>
          {lastUpdated ? <p className="legal-updated">Last updated: {lastUpdated}</p> : null}
          <div className="legal-body">{children}</div>
        </article>
      </main>

      <HomeFooter />
    </div>
  )
}
