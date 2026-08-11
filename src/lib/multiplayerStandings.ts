export interface MultiplayerPlacementEntry {
  totalScore: number
  placement?: number | null
}

export function multiplayerSharedPlacement<T extends MultiplayerPlacementEntry>(
  sortedMembers: T[],
  member: T,
): number {
  return (
    member.placement ??
    sortedMembers.findIndex((candidate) => candidate.totalScore === member.totalScore) + 1
  )
}
