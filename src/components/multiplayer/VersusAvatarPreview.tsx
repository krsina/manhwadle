import { Link } from 'react-router-dom'
import { DEV_AVATAR_BUST_CROPS_PATH } from '../../lib/routes'

/** Local-only entry to the bust crop editor from Versus. */
export function VersusAvatarPreview() {
  return (
    <section className="versus-avatar-preview" aria-label="Versus avatar bust preview">
      <div className="versus-avatar-preview-copy">
        <p className="versus-avatar-preview-kicker">DEV bust preview</p>
        <strong>Tune avatar crops</strong>
        <small>Edit head/torso framing with live Versus + homepage previews.</small>
      </div>
      <div className="versus-avatar-preview-actions">
        <Link className="btn btn-primary" to={DEV_AVATAR_BUST_CROPS_PATH}>
          Open bust crop editor
        </Link>
      </div>
    </section>
  )
}
