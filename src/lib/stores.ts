import { readable, writable } from "svelte/store";
import { FeedType } from "./consts";

export let idList = writable<string[]>([]);

export let alexandriaKinds = readable<number[]>([30040, 30041, 30818]);

export let feedType = writable<FeedType>(FeedType.StandardRelays);


const defaultVisibility = {
  toc: false,
  blog: true,
  main: true,
  inner: false,
  discussion: false,
  editing: false
};

function createVisibilityStore() {
  const { subscribe, set, update } = writable({ ...defaultVisibility });

  return {
    subscribe,
    set,
    update,
    reset: () => set({ ...defaultVisibility })
  };
}

export const publicationColumnVisibility = createVisibilityStore();
