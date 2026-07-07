import { useLanguage } from '../context/LanguageContext.jsx'

export default function AddToItineraryButton({
  onAdd,
  loading = false,
  className,
  children,
  disabled,
  onClick,
  ...props
}) {
  const { t } = useLanguage()

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
        onAdd?.(e)
      }}
      {...props}
    >
      {children ?? (
        <>
          <span className="material-symbols-outlined">add_location</span>
          {t('Add to itinerary')}
        </>
      )}
    </button>
  )
}
