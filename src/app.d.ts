// See https://kit.svelte.dev/docs/types#app

import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import Pharos from "./lib/parser.ts";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      waitable?: Promise<any>;
      publicationType?: string;
      indexEvent?: NDKEvent;
      url?: URL;
    }
    // interface Platform {}
  }
}

export {};
