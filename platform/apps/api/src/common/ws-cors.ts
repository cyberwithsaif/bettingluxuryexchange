// Socket.io CORS for the game gateways. Restricts browser origins to the
// configured allow-list (same as the HTTP CORS). Falls back to "*" only when
// CORS_ORIGINS is unset (local dev) so a misconfig never silently blocks play.
export const WS_CORS = {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
    : "*",
};
