/**
 * DEV-only local owner persona for UI review without a real owner sign-in.
 * Never active in production builds.
 */

import type { User } from '@supabase/supabase-js'
import { DEFAULT_AVATAR_ID } from './avatarComposition'
import { DEFAULT_STAGE_ID } from './avatarStages'
import { isOwnerUserModeEnabled } from './devAccess'
import type { AccountSnapshot } from './profileApi'

export const LOCAL_OWNER_USER_ID = '00000000-0000-4000-8000-000000000001'
export const LOCAL_OWNER_USERNAME = 'LocalOwner'
export const LOCAL_OWNER_PREVIEW_EVENT = 'manhwadle:local-owner-preview'

/** True in Vite DEV when not in owner "user mode". */
export function isLocalOwnerPreviewActive(): boolean {
  return Boolean(import.meta.env.DEV) && !isOwnerUserModeEnabled()
}

export function getLocalOwnerAccount(): AccountSnapshot {
  return {
    userId: LOCAL_OWNER_USER_ID,
    username: LOCAL_OWNER_USERNAME,
    usernameNormalized: LOCAL_OWNER_USERNAME.toLowerCase(),
    usernameChangeRequired: false,
    needsUsername: false,
    usernameChangedAt: '2026-08-01T00:00:00.000Z',
    nextChangeAt: null,
    canChangeUsername: true,
    readerTaste: 'both',
    staffRole: 'owner',
    cloudBanned: false,
    leaderboardExcluded: false,
    canAppearPublicly: true,
    pointsBalance: 1200,
    lifetimeEarned: 4800,
    equippedAvatarId: DEFAULT_AVATAR_ID,
    equippedStageId: DEFAULT_STAGE_ID,
    equippedAwakeningLevel: 0,
  }
}

/** Minimal User-shaped object for AuthProvider / AuthButton in DEV. */
export function getLocalOwnerUser(): User {
  return {
    id: LOCAL_OWNER_USER_ID,
    app_metadata: { provider: 'local-dev', providers: ['local-dev'] },
    user_metadata: { username: LOCAL_OWNER_USERNAME },
    aud: 'authenticated',
    created_at: '2026-08-01T00:00:00.000Z',
    email: 'local-owner@manhwadle.local',
    phone: '',
    role: 'authenticated',
    updated_at: '2026-08-01T00:00:00.000Z',
    identities: [],
    is_anonymous: false,
    factors: [],
  } as User
}

export function applyLocalOwnerPreview(
  account: AccountSnapshot | null,
): AccountSnapshot | null {
  if (!isLocalOwnerPreviewActive()) return account
  if (!account) return getLocalOwnerAccount()
  return {
    ...account,
    staffRole: 'owner',
    needsUsername: false,
    username: account.username ?? LOCAL_OWNER_USERNAME,
    usernameNormalized:
      account.usernameNormalized ?? LOCAL_OWNER_USERNAME.toLowerCase(),
    canAppearPublicly: true,
  }
}
