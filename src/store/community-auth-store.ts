"use client";

import { create } from "zustand";
import { fetchCurrentUser, logoutCommunityUser } from "@/lib/community/client";
import type { CommunityUser } from "@/lib/community/types";
import { ONLINE_FEATURES } from "@/lib/site";

/**
 * One session, one store: the planner header, the community header, the share
 * dialog, and the browser all read the same signed-in user, so signing in
 * anywhere updates everywhere.
 */
interface CommunityAuthStore {
  user?: CommunityUser;
  hasHydrated: boolean;
  isHydrating: boolean;
  hydrate: () => Promise<void>;
  setUser: (user?: CommunityUser) => void;
  signOut: () => Promise<void>;
}

export const useCommunityAuthStore = create<CommunityAuthStore>((set, get) => ({
  user: undefined,
  hasHydrated: false,
  isHydrating: false,
  hydrate: async () => {
    if (get().hasHydrated || get().isHydrating) {
      return;
    }
    if (!ONLINE_FEATURES) {
      // No accounts here: nobody is signed in, and nothing is asked.
      set({ hasHydrated: true });
      return;
    }

    set({ isHydrating: true });
    try {
      set({ user: await fetchCurrentUser(), hasHydrated: true });
    } finally {
      set({ isHydrating: false });
    }
  },
  setUser: (user) => set({ user, hasHydrated: true }),
  signOut: async () => {
    await logoutCommunityUser();
    set({ user: undefined });
  },
}));
