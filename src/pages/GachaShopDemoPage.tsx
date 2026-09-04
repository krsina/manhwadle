import { Navigate } from 'react-router-dom'
import { SHOP_PATH } from '../lib/routes'

export function GachaShopDemoPage() {
  return <Navigate to={SHOP_PATH} replace />
}
