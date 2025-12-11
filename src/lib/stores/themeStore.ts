import { writable } from "svelte/store";

const KEY = "alexandria/theme";

const initial =
  (typeof localStorage !== "undefined" && localStorage.getItem(KEY)) ||
  "light";

export const theme = writable(initial);

theme.subscribe((v) => {
  if (typeof document !== "undefined") {
    const themeValue = String(v);
    document.documentElement.dataset.theme = themeValue;
    localStorage.setItem(KEY, themeValue);

    // Add .dark class for non-light themes (ocean, forrest are dark themes)
    // Remove .dark class for light theme
    if (themeValue === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }
});

export const setTheme = (t: string) => theme.set(t);
