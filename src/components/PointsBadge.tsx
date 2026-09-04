import { Link } from 'react-router-dom'
import { SHOP_PATH } from '../lib/routes'
import { useAuth } from './AuthProvider'
import { useOptionalGachaLocal } from './gacha/GachaLocalProvider'

export function PointsBadge() {
  const { user, account, accountLoading } = useAuth()
  const gacha = useOptionalGachaLocal()
  const points = gacha?.points ?? account?.pointsBalance ?? 0
  const label = user ? (accountLoading && !account ? '…' : String(points)) : 'Shop'

  return (
    <Link
      to={SHOP_PATH}
      className="points-badge"
      aria-label={user ? `${label} shop points. Open shop.` : 'Open shop'}
      title={user ? `${label} shop points` : 'Shop'}
    >
      <span className="points-gem" aria-hidden="true">
        ◆
      </span>
      <span>{label}</span>
    </Link>
  )
}
