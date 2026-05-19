"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

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
    transports: ["polling", "websocket"],
    upgrade: true,
    reconnection: true,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function getSocket() {
  return socket ?? connectSocket();
}
