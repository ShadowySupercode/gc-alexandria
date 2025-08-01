import { browser } from "$app/environment";
import { writable, type Writable } from "svelte/store";
import type { Tab } from "./types.ts";

export const pathLoaded: Writable<boolean> = writable(false);

export const tabs: Writable<Tab[]> = writable([{ id: 0, type: "welcome" }]);
export const tabBehaviour: Writable<string> = writable(
  (browser && localStorage.getItem("wikinostr_tabBehaviour")) || "normal",
);
export const userPublickey: Writable<string> = writable(
  (browser && localStorage.getItem("wikinostr_loggedInPublicKey")) || "",
);
export const networkFetchLimit: Writable<number> = writable(50);
export const levelsToRender: Writable<number> = writable(3);
