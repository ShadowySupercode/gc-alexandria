import { SvelteSet } from "svelte/reactivity";
import { PublicationTree } from "../../data_structures/publication_tree.ts";
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

export class SveltePublicationTree {
  resolvedAddresses: SvelteSet<string> = new SvelteSet();

  #publicationTree: PublicationTree;
  #nodeResolvedObservers: Array<(address: string) => void> = [];
  #bookmarkMovedObservers: Array<(address: string) => void> = [];

  constructor(rootEvent: NDKEvent, ndk: NDK) {
    this.#publicationTree = new PublicationTree(rootEvent, ndk);

    this.#publicationTree.onNodeResolved(this.#handleNodeResolved);
    this.#publicationTree.onBookmarkMoved(this.#handleBookmarkMoved);
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

  /**
   * Registers an observer function that is invoked whenever a new node is resolved.
   * @param observer The observer function.
   */
  onNodeResolved(observer: (address: string) => void) {
    this.#nodeResolvedObservers.push(observer);
  }

  /**
   * Registers an observer function that is invoked whenever the bookmark is moved.
   * @param observer The observer function.
   */
  onBookmarkMoved(observer: (address: string) => void) {
    this.#bookmarkMovedObservers.push(observer);
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

  /**
   * Observer function that is invoked whenever a new node is resolved on the publication tree.
   *
   * @param address The address of the resolved node.
   *
   * This member is declared as an arrow function to ensure that the correct `this` context is
   * used when the function is invoked in this class's constructor.
   */
  #handleNodeResolved = (address: string) => {
    this.resolvedAddresses.add(address);
    for (const observer of this.#nodeResolvedObservers) {
      observer(address);
    }
  };

  /**
   * Observer function that is invoked whenever the bookmark is moved on the publication tree.
   *
   * @param address The address of the new bookmark.
   *
   * This member is declared as an arrow function to ensure that the correct `this` context is
   * used when the function is invoked in this class's constructor.
   */
  #handleBookmarkMoved = (address: string) => {
    for (const observer of this.#bookmarkMovedObservers) {
      observer(address);
    }
  };

  // #endregion
}
