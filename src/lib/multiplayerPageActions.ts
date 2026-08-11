export async function leaveMultiplayerPage(
  leave: () => Promise<boolean>,
  navigateToHub: () => void,
): Promise<boolean> {
  const left = await leave()
  if (!left) return false
  navigateToHub()
  return true
}

export function multiplayerInteractionsBlocked(
  pending: boolean,
  refreshError: unknown,
): boolean {
  return pending || refreshError != null
}
