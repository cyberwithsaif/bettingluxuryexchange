// Single place that resolves the JWT signing secret. In production a strong
// secret MUST be configured — we refuse the insecure dev fallback so a
// misconfigured deploy can never sign/verify tokens with a known string.
export function jwtSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_ACCESS_SECRET must be set to a strong (16+ char) value in production");
  }
  return "dev-access-secret-change-me";
}
