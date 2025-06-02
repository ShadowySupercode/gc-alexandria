import { browser } from "$app/environment";
import { writable, type Writable } from "svelte/store";
import type { Tab } from "./types";

export const pathLoaded: Writable<boolean> = writable(false);

export const tabs: Writable<Tab[]> = writable([{ id: 0, type: "welcome" }]);
export const tabBehaviour: Writable<string> = writable(
  (browser && localStorage.getItem("alexandria_tabBehaviour")) || "normal",
);
export const userPublickey: Writable<string> = writable(
  (browser && localStorage.getItem("alexandria_loggedInPublicKey")) || "",
);
export const networkFetchLimit: Writable<number> = writable(5);
export const levelsToRender: Writable<number> = writable(3);

// Publication-specific state
export const currentPublication: Writable<string | null> = writable(null);
export const publicationViewMode: Writable<'reader' | 'editor'> = writable(
  (browser && (localStorage.getItem("alexandria_viewMode") as 'reader' | 'editor')) || "reader"
);
export const fontSize: Writable<number> = writable(
  (browser && parseInt(localStorage.getItem("alexandria_fontSize") || "16")) || 16
);
export const theme: Writable<'light' | 'dark' | 'sepia'> = writable(
  (browser && (localStorage.getItem("alexandria_theme") as 'light' | 'dark' | 'sepia')) || "light"
);
