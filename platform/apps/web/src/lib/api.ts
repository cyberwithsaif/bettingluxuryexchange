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

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as any;

    if (err.response?.status === 401 && !original._retry) {
      const { refreshToken, set, clear } = useAuthStore.getState();

      if (!refreshToken) {
        clear();
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
        const { data } = await axios.post("/api/auth/refresh", { refreshToken });
        const newToken = data.accessToken;
        set({ accessToken: newToken, refreshToken: data.refreshToken ?? refreshToken, user: data.user });
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
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
