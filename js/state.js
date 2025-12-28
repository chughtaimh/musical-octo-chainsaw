/**
 * state.js - Application State Management
 * 
 * IMPORTANT: Multi-user data (weeklyPlans, allHistory) is owned by Firebase.
 * This module only holds in-memory caches of Firebase data.
 * 
 * State ownership:
 * - allHistory, eventsCache: Read-only cache from Firebase 'history' node
 * - weeklyPlans: Read-only cache from Firebase 'weeklyPlans' node
 * - ensuredWeeklyPlansOnce: Local flag to prevent redundant seeding
 * - activeModalUser: Local UI state only (which user's modal is open)
 * 
 * To modify multi-user data, always write to Firebase - the onValue listeners
 * will automatically update these caches.
 */
export const state = {
    // Firebase data caches (read-only, updated by onValue listeners)
    allHistory: {},
    eventsCache: [],
    weeklyPlans: { Moe: 14, Trish: 14 }, // Defaults until Firebase syncs

    // Local flags
    ensuredWeeklyPlansOnce: false,
    weeklyCheckInShownThisWeek: false,

    // Commitment data (loaded from localStorage)
    commitments: {
        Moe: { why: "", setDate: null },
        Trish: { why: "", setDate: null }
    },

    // UI state
    activeModalUser: null
};
