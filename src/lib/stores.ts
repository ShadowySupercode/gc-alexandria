import { readable, writable } from "svelte/store";
import { FeedType } from "./consts";

export let idList = writable<string[]>([]);

export let alexandriaKinds = readable<number[]>([30040, 30041]);

export let feedType = writable<FeedType>(FeedType.Relays);
