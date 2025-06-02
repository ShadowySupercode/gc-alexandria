// See https://kit.svelte.dev/docs/types#app

import type { NostrEvent } from './lib/types/nostr';
import type { NostrClient } from './lib/types/nostr';
import Pharos from "./lib/parser.ts";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      client: NostrClient;
      parser: Pharos;
      indexEvent: NostrEvent;
      url: URL;
      publicationType: string;
      waitable: Promise<void>;
    }
    // interface Platform {}
  }
}

export {};
