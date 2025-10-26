import { writable } from "svelte/store";

const KEY = "alexandria/theme";

const initial =
  (typeof localStorage !== "undefined" && localStorage.getItem(KEY)) ||
  "light";

export const theme = writable(initial);

theme.subscribe((v) => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = String(v);
    localStorage.setItem(KEY, String(v));
  }
});

export const setTheme = (t: string) => theme.set(t);
