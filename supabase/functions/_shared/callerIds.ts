/**
 * Reject client-supplied caller identity fields. Actor / subject must come
 * from `auth.getUser(jwt)` only.
 */

const SPOOFED_CALLER_KEYS = [
  "actor_id",
  "actorId",
  "user_id",
  "userId",
] as const;

export function findSpoofedCallerIdKey(
  body: Record<string, unknown> | null | undefined,
): string | null {
  if (!body || typeof body !== "object") return null;
  for (const key of SPOOFED_CALLER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return key;
  }
  return null;
}

export function spoofedCallerIdErrorMessage(key: string): string {
  return `${key} not allowed; identity is derived from the JWT only`;
}
