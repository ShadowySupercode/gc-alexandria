// See https://kit.svelte.dev/docs/types#app

import { NDKEvent, NDKNip07Signer } from "@nostr-dev-kit/ndk";
import { HLJSApi } from "highlight.js";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      waitable?: Promise<unknown>;
      publicationType?: string;
      indexEvent?: NDKEvent;
      url?: URL;
    }
    // interface Platform {}
  }

  var hljs: HLJSApi;

  // deno-lint-ignore no-explicit-any
  var MathJax: any;

  var nostr: NDKNip07Signer & {
    getRelays: () => Promise<Record<string, Record<string, boolean | undefined>>>;
    // deno-lint-ignore no-explicit-any
    signEvent: (event: any) => Promise<any>;
  };
}

export {};
