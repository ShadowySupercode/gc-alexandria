import { SvelteSet } from "svelte/reactivity";
import { PublicationTree } from "../../data_structures/publication_tree.ts";
import { NDKEvent } from "../../utils/nostrUtils.ts";
import NDK from "@nostr-dev-kit/ndk";

export class SveltePublicationTree {
  resolvedAddresses: SvelteSet<string> = new SvelteSet();

  #publicationTree: PublicationTree;

  constructor(rootEvent: NDKEvent, ndk: NDK) {
    this.#publicationTree = new PublicationTree(rootEvent, ndk);

    this.#publicationTree.onNodeResolved(this.#handleNodeResolved);
  }

  // #region Proxied Public Methods

  getEvent(address: string): Promise<NDKEvent | null> {
    return this.#publicationTree.getEvent(address);
  }

  getHierarchy(address: string): Promise<NDKEvent[]> {
    return this.#publicationTree.getHierarchy(address);
  }

  setBookmark(address: string) {
    this.#publicationTree.setBookmark(address);
  }

  // #endregion

  // #region Proxied Async Iterator Methods

  [Symbol.asyncIterator](): AsyncIterator<NDKEvent | null> {
    return this;
  }

  next(): Promise<IteratorResult<NDKEvent | null>> {
    return this.#publicationTree.next();
  }

  previous(): Promise<IteratorResult<NDKEvent | null>> {
    return this.#publicationTree.previous();
  }

  // #endregion

  // #region Private Methods

  #handleNodeResolved(address: string) {
    this.resolvedAddresses.add(address);
  }

  // #endregion
}