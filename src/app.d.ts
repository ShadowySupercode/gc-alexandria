// See https://kit.svelte.dev/docs/types#app

import Pharos from "./lib/parser.ts";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      parser?: Pharos;
      event?: NDKEvent;
      publicationType?: string;
    }
    // interface Platform {}
  }
}

export {};
