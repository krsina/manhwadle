/** AniList placeholder when a character has no real portrait. */
export const PLACEHOLDER_IMAGE_RE =
  /\/character\/(?:large|medium)\/default\.jpg(?:\?|$)/i

/** True when large/medium is present and not AniList's default.jpg stub. */
export function hasRealCharacterImage(char) {
  const large = char?.image?.large || ''
  const medium = char?.image?.medium || ''
  if (!large && !medium) return false
  if (PLACEHOLDER_IMAGE_RE.test(large) || PLACEHOLDER_IMAGE_RE.test(medium)) return false
  return true
}
