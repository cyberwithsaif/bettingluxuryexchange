import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/lib/stores/auth";

export const api = axios.create({
  baseURL: "/admin/api",
  timeout: 15_000,
});

// Attach access token to every request
api.interceptors.request.use((cfg) => {
  const t = useAuthStore.getState().accessToken;
  if (t) {
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

// Auto-refresh on 401 using refresh token
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> = [];

function processQueue(error: any, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  pendingQueue = [];
}

function isOnLoginPage() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.endsWith("/login");
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as any;

    if (err.response?.status === 401 && !original._retry) {
      // Never tamper with auth state while the user is on /login —
      // login itself uses 401 to signal bad credentials and clear() here would
      // race the setAuth call that's about to land tokens.
      if (isOnLoginPage()) {
        return Promise.reject(err);
      }

      const { refreshToken, set, clear } = useAuthStore.getState();

      // No refresh token at all — user genuinely isn't authenticated.
      // Don't clear() here (it triggers the redirect effect in AdminShell);
      // just reject so the caller sees the error. AdminShell's hydration
      // guard handles the redirect for truly-unauthenticated states.
      if (!refreshToken) {
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post("/admin/api/auth/refresh", { refreshToken });
        const newToken = data.accessToken;
        set({ accessToken: newToken, refreshToken: data.refreshToken ?? refreshToken, user: data.user });
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        // Only clear when refresh has truly failed — this is the real
        // "session is dead" signal. AdminShell's effect will then redirect.
        clear();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  },
);

export const fetcher = (url: string) => api.get(url).then((r) => r.data);
