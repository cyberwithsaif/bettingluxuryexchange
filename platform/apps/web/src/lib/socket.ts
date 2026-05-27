"use client";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/lib/stores/auth";

let socket: Socket | null = null;
let reauthing = false;

const isAuthError = (e: any) => {
  const msg = typeof e === "string" ? e : (e?.message ?? "");
  return /unauthor|session expired|token|jwt/i.test(msg);
};

/**
 * Self-heal the socket when the WS guard rejects a message (stale/expired token).
 * REST auto-refreshes via an interceptor, but the socket has no such path, so we
 * reconnect with the current token — refreshing it first if the store's token is
 * the one being rejected.
 */
export async function reauthSocket() {
  if (reauthing || !socket) return;
  reauthing = true;
  try {
    const store = useAuthStore.getState();
    const cur = (socket.auth as any)?.token;
    if (store.accessToken && store.accessToken !== cur) {
      socket.auth = { token: store.accessToken };
      socket.disconnect().connect();
    } else if (store.refreshToken) {
      const { data } = await axios.post("/api/auth/refresh", { refreshToken: store.refreshToken });
      store.set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? store.refreshToken, user: data.user });
      socket.auth = { token: data.accessToken };
      socket.disconnect().connect();
    }
  } catch { /* refresh failed — user will be logged out by the REST flow */ }
  finally { setTimeout(() => { reauthing = false; }, 1500); }
}

export function connectSocket(token?: string | null) {
  const url = process.env.NEXT_PUBLIC_WS_BASE || (typeof window !== "undefined" ? window.location.origin : "");
  
  if (socket) {
    const currentToken = (socket.auth as any)?.token;
    if (currentToken === token && socket.connected) {
      return socket;
    }
    socket.auth = token ? { token } : {};
    socket.disconnect().connect();
    return socket;
  }

  socket = io(url, {
    path: "/socket.io",
    auth: token ? { token } : undefined,
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
  });
  // Auto-recover from auth rejections instead of leaving the socket dead.
  socket.on("exception", (e) => { if (isAuthError(e)) reauthSocket(); });
  socket.on("connect_error", (e) => { if (isAuthError(e)) reauthSocket(); });
  return socket;
}

export function getSocket() {
  if (socket) return socket;
  // Create authenticated from the start — the token is hydrated synchronously
  // from persisted storage, so first-render callers don't get an unauth socket
  // (which the WS guard would reject with "Unauthorized").
  const token = useAuthStore.getState().accessToken;
  return connectSocket(token);
}
