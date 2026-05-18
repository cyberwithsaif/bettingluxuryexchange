"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User { id: string; username: string; role: string; }
interface State {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  set: (s: Partial<Omit<State, "set" | "clear">>) => void;
  clear: () => void;
}

export const useAuthStore = create<State>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      set: (s) => set(s),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: "exch-admin-auth",
    },
  ),
);
