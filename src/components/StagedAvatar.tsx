import type { CSSProperties } from 'react'
import { PixelAvatar } from './PixelAvatar'
import { avatarStageCssUrl } from '../lib/avatarStages'

/**
 * Whole-character avatar framed on its equipped stage plate, like the
 * leaderboard showcase cards. Sized by `--staged-avatar-size` at the call site.
 */
export function StagedAvatar({
  avatarId,
  stageId,
  className = '',
}: {
  avatarId?: string | null
  stageId?: string | null
  className?: string
}) {
  const style = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(stageId),
  } as CSSProperties

  return (
    <span
      className={['staged-avatar', 'avatar-stage-well', className].filter(Boolean).join(' ')}
      style={style}
    >
      <PixelAvatar
        characterId={avatarId}
        size="md"
        decorative
        className="staged-avatar-art"
      />
    </span>
  )
}
