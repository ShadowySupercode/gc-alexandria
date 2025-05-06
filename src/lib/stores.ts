import { readable, writable } from "svelte/store";
import { FeedType } from "./consts";

export let idList = writable<string[]>([]);

export let alexandriaKinds = readable<number[]>([30040, 30041, 30818]);

export let feedType = writable<FeedType>(FeedType.StandardRelays);

export const publicationColumnVisibility = writable({
  toc: false,
  blog: true,
  main: true,
  inner: true,
  discussion: false,
  editing: false
});