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

  getChildAddresses(address: string): Promise<Array<string | null>> {
    return this.#publicationTree.getChildAddresses(address);
  }

  getEvent(address: string): Promise<NDKEvent | null> {
    return this.#publicationTree.getEvent(address);
  }

  getHierarchy(address: string): Promise<NDKEvent[]> {
    return this.#publicationTree.getHierarchy(address);
  }

  async getParent(address: string): Promise<NDKEvent | null> {
    const hierarchy = await this.getHierarchy(address);

    // The last element in the hierarchy is the event with the given address, so the parent is the
    // second to last element.
    return hierarchy.at(-2) ?? null;
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