import { readable, writable } from "svelte/store";
import { FeedType } from "./consts.ts";

export let idList = writable<string[]>([]);

export let alexandriaKinds = readable<number[]>([30040, 30041, 30818]);

export let feedType = writable<FeedType>(FeedType.StandardRelays);

export interface PublicationLayoutVisibility {
  toc: boolean;
  blog: boolean;
  main: boolean;
  inner: boolean;
  discussion: boolean;
  editing: boolean;
}

const defaultVisibility: PublicationLayoutVisibility = {
  toc: false,
  blog: true,
  main: true,
  inner: false,
  discussion: false,
  editing: false,
};

function createVisibilityStore() {
  const { subscribe, set, update } = writable<PublicationLayoutVisibility>({
    ...defaultVisibility,
  });

  return {
    subscribe,
    set,
    update,
    reset: () => set({ ...defaultVisibility }),
  };
}

export const publicationColumnVisibility = createVisibilityStore();
