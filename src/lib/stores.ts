import { writable } from "svelte/store";

// The old feedType store is no longer needed since we use the new relay management system
// All relay selection is now handled by the activeInboxRelays and activeOutboxRelays stores in ndk.ts

export const idList = writable<string[]>([]);

export const alexandriaKinds = writable<number[]>([30040, 30041, 30818]);

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
