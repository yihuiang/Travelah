import '../styles/travelah-loader.css'

export default function TravelahLoader({ label = 'Loading' }) {
  return (
    <div className="travelah-loader" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <div className="travelah-loader-mark" aria-hidden="true">
        <span className="travelah-loader-word travelah-loader-word--dim">travelah</span>
        <div className="travelah-loader-fill">
          <span className="travelah-loader-word">travelah</span>
        </div>
      </div>
    </div>
  )
}
