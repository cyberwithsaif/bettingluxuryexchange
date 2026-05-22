"use client";
import { createContext } from "react";

export const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void } | null>(null);
