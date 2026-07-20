interface StatusBannerProps {
  message: string | null
  severity?: 'info' | 'warning' | 'critical'
  maintenanceActive?: boolean
}

export function StatusBanner({
  message,
  severity = 'info',
  maintenanceActive = false,
}: StatusBannerProps) {
  if (!message && !maintenanceActive) return null
  const text =
    message ||
    (maintenanceActive
      ? 'Manhwadle is under maintenance. Some features may be unavailable.'
      : null)
  if (!text) return null

  return (
    <div
      className={`status-banner status-banner-${severity}${maintenanceActive ? ' is-maintenance' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="status-banner-text">{text}</p>
    </div>
  )
}
