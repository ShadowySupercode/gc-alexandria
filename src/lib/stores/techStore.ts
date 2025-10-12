/**
 * Tech Store - Alexandria
 *
 * This store manages the "show technical details" user setting for the Alexandria app.
 *
 * Use case:
 * - Used with the ATechBlock component to hide nostr-specific developer details (e.g., raw event blocks) behind a collapsed section.
 * - Users can toggle visibility of these technical details via the ATechToggle component.
 * - If a user is a nostr developer, they can set their profile to always show technical details by default.
 * - The setting is persisted in localStorage and reflected in the DOM via a data attribute for styling purposes.
 *
 * Example usage:
 *   <ATechBlock content={...} />
 *   <ATechToggle />
 *
 * This enables a cleaner UI for non-developers, while providing easy access to advanced information for developers.
 */

import { writable } from "svelte/store";
const KEY = "alexandria/showTech";

// Default false unless explicitly set to 'true' in localStorage
const initial = typeof localStorage !== "undefined"
  ? localStorage.getItem(KEY) === "true"
  : false;

export const showTech = writable<boolean>(initial);

showTech.subscribe((v) => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.tech = v ? "on" : "off";
    localStorage.setItem(KEY, String(v));
  }
});
