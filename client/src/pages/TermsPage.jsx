import { Link } from 'react-router-dom'
import LegalPageLayout from '../components/LegalPageLayout.jsx'

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="25 June 2026">
      <p>
        Welcome to Travelah. By creating an account or using our website and services, you agree to
        these Terms of Service. If you do not agree, please do not use Travelah.
      </p>

      <h2>1. About Travelah</h2>
      <p>
        Travelah is a travel planning platform focused on Malaysia. We help you discover places,
        save trips, and generate AI-assisted itineraries using publicly available travel content and
        your account preferences.
      </p>

      <h2>2. Your account</h2>
      <p>You are responsible for:</p>
      <ul>
        <li>Providing accurate registration information</li>
        <li>Keeping your password secure</li>
        <li>All activity that occurs under your account</li>
      </ul>
      <p>
        You must be at least 13 years old to use Travelah. If you sign in with Google, you also agree
        to Google&apos;s terms for that sign-in method.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use Travelah for unlawful, harmful, or abusive purposes</li>
        <li>Attempt to access other users&apos; accounts or our systems without permission</li>
        <li>Scrape, copy, or redistribute our content or data at scale without consent</li>
        <li>Upload malicious code or interfere with the service</li>
      </ul>

      <h2>4. Trips, saved places, and AI content</h2>
      <p>
        Itineraries and recommendations are generated for planning assistance only. Travelah does not
        guarantee availability, pricing, safety, or accuracy of places, routes, or third-party content.
        Always verify details before travelling.
      </p>

      <h2>5. Third-party content</h2>
      <p>
        Travelah may display information sourced from third parties, including social platforms and
        public listings. We do not own that content and are not responsible for third-party sites,
        services, or policies.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Travelah name, branding, software, and original presentation are owned by us or our
        licensors. You may use the service for personal, non-commercial travel planning unless we
        agree otherwise in writing.
      </p>

      <h2>7. Suspension and termination</h2>
      <p>
        We may suspend or terminate access if these terms are violated or if needed to protect the
        service or other users. You may stop using Travelah at any time and request account deletion
        through our contact channels.
      </p>

      <h2>8. Disclaimer</h2>
      <p>
        Travelah is provided &quot;as is&quot; without warranties of any kind. To the fullest extent
        permitted by law, we are not liable for indirect, incidental, or consequential damages
        arising from your use of the service.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms from time to time. Continued use after changes are posted means you
        accept the revised terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms can be sent to{' '}
        <a href="mailto:support@travelah.app">support@travelah.app</a>. See also our{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPageLayout>
  )
}
