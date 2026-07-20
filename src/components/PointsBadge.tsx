import { Link } from 'react-router-dom'
import { SHOP_PATH } from '../lib/routes'
import { useAuth } from './AuthProvider'

export function PointsBadge() {
  const { user, account, accountLoading } = useAuth()
  const label = user ? (accountLoading && !account ? '…' : String(account?.pointsBalance ?? 0)) : 'Shop'

  return (
    <Link
      to={SHOP_PATH}
      className="points-badge"
      aria-label={user ? `${label} shop points. Open avatar shop.` : 'Open avatar shop'}
      title={user ? `${label} shop points` : 'Avatar shop'}
    >
      <span className="points-gem" aria-hidden="true">
        ◆
      </span>
      <span>{label}</span>
    </Link>
  )
}
