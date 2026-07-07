import { Link } from 'react-router-dom'
import '../styles/save-toast.css'

export default function SavePlaceToast({ toast }) {
  if (!toast?.message) return null

  return (
    <div className="save-place-toast" role="status" aria-live="polite">
      <span className="material-symbols-outlined">{toast.icon || 'bookmark'}</span>
      <span>{toast.message}</span>
      {toast.linkTo && toast.linkLabel ? (
        <Link to={toast.linkTo} state={toast.linkState} className="save-place-toast-link">
          {toast.linkLabel}
        </Link>
      ) : null}
    </div>
  )
}
