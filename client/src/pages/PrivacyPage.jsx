import { Link } from 'react-router-dom'
import LegalPageLayout from '../components/LegalPageLayout.jsx'

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="25 June 2026">
      <p>
        This Privacy Policy explains how Travelah collects, uses, and protects information when you
        use our website and services.
      </p>

      <h2>1. Information we collect</h2>
      <p>Depending on how you use Travelah, we may collect:</p>
      <ul>
        <li>
          <strong>Account details</strong> — name, email, username, password (stored securely as a
          hash), and travel preferences you choose during setup
        </li>
        <li>
          <strong>Google sign-in data</strong> — if you use Google, we receive basic profile
          information from Google such as your email and Google account ID to create or sign you in
        </li>
        <li>
          <strong>Trip data</strong> — saved places, itineraries, trip dates, and related planning
          content you create in the app
        </li>
        <li>
          <strong>Technical data</strong> — browser type, device information, and usage logs needed to
          operate and secure the service
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Create and manage your account</li>
        <li>Save trips and personalize recommendations</li>
        <li>Generate AI-assisted itineraries based on your preferences</li>
        <li>Improve reliability, security, and product features</li>
        <li>Respond to support requests</li>
      </ul>

      <h2>3. What we do not do</h2>
      <ul>
        <li>We do not sell your personal information</li>
        <li>We do not store your plain-text password</li>
        <li>We do not use Google profile photos as your Travelah avatar by default</li>
      </ul>

      <h2>4. Sharing with third parties</h2>
      <p>We may share limited data with service providers that help us run Travelah, such as:</p>
      <ul>
        <li>Cloud hosting and database providers</li>
        <li>Google, when you choose Google Sign-In</li>
        <li>AI or mapping services used to generate itineraries or location data</li>
      </ul>
      <p>
        These providers may only use data as needed to perform services for us. We may also disclose
        information if required by law.
      </p>

      <h2>5. Cookies and local storage</h2>
      <p>
        Travelah may use cookies or browser local storage to keep you signed in, remember preferences,
        and maintain session state. You can control cookies through your browser settings, but some
        features may not work without them.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We keep account and trip data while your account is active. If you delete your account or ask
        us to remove your data, we will delete or anonymize it within a reasonable period, except
        where retention is required by law or for security backups.
      </p>

      <h2>7. Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect your information. No online
        service can guarantee absolute security, so please use a strong password and keep it private.
      </p>

      <h2>8. Your choices</h2>
      <p>You can:</p>
      <ul>
        <li>Update profile and preference information in your account settings</li>
        <li>Sign out or disable &quot;remember me&quot; on shared devices</li>
        <li>Contact us to request access, correction, or deletion of your data</li>
      </ul>

      <h2>9. Children</h2>
      <p>
        Travelah is not directed at children under 13. If you believe a child has provided us personal
        information, contact us so we can remove it.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the
        top will reflect the latest version.
      </p>

      <h2>11. Contact</h2>
      <p>
        Privacy questions can be sent to{' '}
        <a href="mailto:privacy@travelah.app">privacy@travelah.app</a>. See also our{' '}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalPageLayout>
  )
}
