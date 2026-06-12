import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/lib/stores/auth";

export const api = axios.create({
  baseURL: "/bookie/api",
  timeout: 15_000,
});

// Attach access token to every request.
api.interceptors.request.use((cfg) => {
  const t = useAuthStore.getState().accessToken;
  if (t) {
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

// Auto-refresh on 401, mirroring the admin client.
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> = [];
function processQueue(error: any, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)));
  pendingQueue = [];
}
const onLogin = () => typeof window !== "undefined" && window.location.pathname.endsWith("/login");

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as any;
    if (err.response?.status === 401 && !original._retry) {
      if (onLogin()) return Promise.reject(err);
      const { refreshToken, set, clear } = useAuthStore.getState();
      if (!refreshToken) return Promise.reject(err);
      if (isRefreshing) {
        return new Promise((resolve, reject) => pendingQueue.push({ resolve, reject }))
          .then((token) => { original.headers.Authorization = `Bearer ${token}`; return api(original); });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post("/bookie/api/auth/refresh", { refreshToken });
        set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken, user: data.user });
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        // Only clear on a definitive auth rejection — transient network/5xx
        // failures must NOT log the bookie out.
        const status = (refreshErr as AxiosError)?.response?.status;
        if (status === 401 || status === 403) clear();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  },
);

export const fetcher = (url: string) => api.get(url).then((r) => r.data);
