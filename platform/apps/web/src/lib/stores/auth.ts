"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser { id: string; username: string; role: string; }

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  set: (s: Partial<AuthState>) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      set: (s) => set(s),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: "exch-auth" },
  ),
);
