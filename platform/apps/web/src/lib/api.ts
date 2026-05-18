import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/lib/stores/auth";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE || "/api",
  timeout: 15_000,
});

api.interceptors.request.use((cfg) => {
  const t = useAuthStore.getState().accessToken;
  if (t) {
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${t}`;
  }
  // Route through the local /api proxy when baseURL is relative.
  if (!cfg.baseURL || cfg.baseURL === "/api") {
    cfg.url = cfg.url?.startsWith("/") ? cfg.url : `/${cfg.url}`;
  } else {
    cfg.url = cfg.url?.startsWith("/api") || cfg.url?.startsWith("http")
      ? cfg.url
      : `/api${cfg.url?.startsWith("/") ? "" : "/"}${cfg.url}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clear();
    }
    return Promise.reject(err);
  },
);

export const fetcher = (url: string) => api.get(url).then((r) => r.data);
