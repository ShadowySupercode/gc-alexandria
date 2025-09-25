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
