"use client";
import { create } from "zustand";
import type { BetSide } from "@exch/shared";

export interface BetslipSelection {
  marketId: string;
  marketName: string;
  matchName: string;
  runnerId: string;
  runnerName: string;
  side: BetSide;
  odds: number;
  stake: number;
  fancyValue?: number;
}

interface BetslipState {
  selections: BetslipSelection[];
  add: (sel: BetslipSelection) => void;
  remove: (runnerId: string, side: BetSide) => void;
  update: (runnerId: string, side: BetSide, patch: Partial<BetslipSelection>) => void;
  clear: () => void;
}

export const useBetslip = create<BetslipState>((set) => ({
  selections: [],
  add: (sel) =>
    set((st) => {
      const filtered = st.selections.filter(
        (s) => !(s.runnerId === sel.runnerId && s.side === sel.side),
      );
      return { selections: [...filtered, sel] };
    }),
  remove: (runnerId, side) =>
    set((st) => ({ selections: st.selections.filter((s) => !(s.runnerId === runnerId && s.side === side)) })),
  update: (runnerId, side, patch) =>
    set((st) => ({
      selections: st.selections.map((s) =>
        s.runnerId === runnerId && s.side === side ? { ...s, ...patch } : s,
      ),
    })),
  clear: () => set({ selections: [] }),
}));
