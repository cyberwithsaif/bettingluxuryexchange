import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/lib/stores/auth";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE || "/api",
  timeout: 15_000,
});

// Attach access token to every request
api.interceptors.request.use((cfg) => {
  const t = useAuthStore.getState().accessToken;
  if (t) {
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${t}`;
  }
  if (!cfg.baseURL || cfg.baseURL === "/api") {
    cfg.url = cfg.url?.startsWith("/") ? cfg.url : `/${cfg.url}`;
  } else {
    cfg.url = cfg.url?.startsWith("/api") || cfg.url?.startsWith("http")
      ? cfg.url
      : `/api${cfg.url?.startsWith("/") ? "" : "/"}${cfg.url}`;
  }
  return cfg;
});

// ─── Token refresh — ONE single-flight shared by every caller ─────────────────
// The proactive timer (providers.tsx) and the 401 interceptor below both go
// through here, so concurrent refreshes can never race each other with the
// same (rotating) refresh token. The user is logged out ONLY when the server
// definitively rejects the refresh token (401/403) — never on network blips,
// timeouts or 5xx (e.g. a pm2 reload gap), which previously caused the
// random "always logged out" problem.
let refreshPromise: Promise<string | null> | null = null;

export function refreshTokens(): Promise<string | null> {
  const { refreshToken, set, clear } = useAuthStore.getState();
  if (!refreshToken) return Promise.resolve(null);
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .post("/api/auth/refresh", { refreshToken }, { timeout: 15_000 })
    .then(({ data }) => {
      set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken, user: data.user });
      api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
      return data.accessToken as string;
    })
    .catch((e) => {
      const status = (e as AxiosError)?.response?.status;
      if (status === 401 || status === 403) clear(); // real rejection → sign out
      return null;                                   // transient → stay signed in
    })
    .finally(() => { refreshPromise = null; });

  return refreshPromise;
}

// Auto-refresh on 401, then retry the original request once.
api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as any;

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const token = await refreshTokens(); // single-flight; null on failure
      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }

    return Promise.reject(err);
  },
);

export const fetcher = (url: string) => api.get(url).then((r) => r.data);
