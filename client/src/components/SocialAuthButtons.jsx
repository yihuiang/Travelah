import { GoogleLogin } from '@react-oauth/google'
import { useGoogleAuthReady } from './GoogleAuthBridge.jsx'

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function SocialAuthButtons({
  disabled = false,
  compact = false,
  onGoogleSuccess,
  onGoogleError,
}) {
  const { enabled } = useGoogleAuthReady()
  const isDisabled = disabled || !enabled

  function handleSuccess(credentialResponse) {
    if (!credentialResponse?.credential) {
      onGoogleError?.('Google did not return a sign-in token.')
      return
    }
    onGoogleSuccess?.(credentialResponse.credential)
  }

  return (
    <div className="social-row">
      <div className="social-google-wrap">
        <button
          type="button"
          className="btn-social"
          disabled={isDisabled}
          aria-label="Continue with Google"
          tabIndex={-1}
        >
          <GoogleIcon />
          {compact ? 'Google' : 'Continue with Google'}
        </button>
        {enabled && !disabled && (
          <div className="social-google-overlay" aria-hidden="true">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => onGoogleError?.('Google sign-in was cancelled or failed.')}
              type="standard"
              theme="outline"
              size="large"
              text="continue_with"
              shape="pill"
              width="320"
            />
          </div>
        )}
      </div>
      {!enabled && (
        <p className="social-config-hint">Google sign-in is not configured yet.</p>
      )}
    </div>
  )
}
