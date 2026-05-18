"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User { id: string; username: string; role: string; }
interface State {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  _hydrated: boolean;
  set: (s: Partial<Omit<State, "_hydrated" | "set" | "clear">>) => void;
  clear: () => void;
}

export const useAuthStore = create<State>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      _hydrated: false,
      set: (s) => set(s),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: "exch-admin-auth",
      // Only persist the auth data, not the hydration flag
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
      onRehydrateStorage: () => (state) => {
        // Called after localStorage data is loaded — mark hydration complete
        if (state) state._hydrated = true;
      },
    },
  ),
);
