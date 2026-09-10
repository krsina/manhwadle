import type { AccountSnapshot } from './profileApi'

/** Cloud features that can open their own UX wait until identity setup is done. */
export function isAccountSetupComplete(
  hasUser: boolean,
  accountLoading: boolean,
  account: AccountSnapshot | null,
): boolean {
  return hasUser && !accountLoading && account?.needsUsername === false
}
