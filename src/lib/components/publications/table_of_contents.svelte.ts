import { SvelteMap } from 'svelte/reactivity';
import type { SveltePublicationTree } from './svelte_publication_tree.svelte.ts';
import type { NDKEvent } from '../../utils/nostrUtils.ts';

export interface TocEntry {
  address: string;
  title: string;
  href?: string;
  children: TocEntry[];
  parent?: TocEntry;
  depth: number;
}

/**
 * Maintains a table of contents (ToC) for a `SveltePublicationTree`.  Since publication trees are
 * conceptually infinite and lazy-loading, the ToC represents only the portion of the tree that has
 * been "discovered".  The ToC is updated as new nodes are resolved within the publication tree.
 * 
 * @see SveltePublicationTree
 */
export class TableOfContents {
  public addressMap: SvelteMap<string, TocEntry> = new SvelteMap();
  
  #root: TocEntry | null = null;
  #publicationTree: SveltePublicationTree;
  #pagePathname: string;

  /**
   * Constructs a `TableOfContents` from a `SveltePublicationTree`.
   * 
   * @param rootAddress The address of the root event.
   * @param publicationTree The SveltePublicationTree instance.
   * @param pagePathname The current page pathname for href generation.
   */
  constructor(rootAddress: string, publicationTree: SveltePublicationTree, pagePathname: string) {
    this.#publicationTree = publicationTree;
    this.#pagePathname = pagePathname;
    void this.#initRoot(rootAddress);
    this.#publicationTree.onNodeResolved((address: string) => {
      void this.#handleNodeResolved(address);
    });
  }

  // #region Public Methods

  /**
   * Returns the root entry of the ToC.
   * 
   * @returns The root entry of the ToC, or `null` if the ToC has not been initialized.
   */
  getRootEntry(): TocEntry | null {
    return this.#root;
  }

  getEntry(address: string): TocEntry | undefined {
    return this.addressMap.get(address);
  }

  /**
   * Builds a table of contents from the DOM subtree rooted at `parentElement`.
   * 
   * @param parentElement The root of the DOM subtree containing the content to be added to the
   * ToC.
   * @param parentAddress The address of the event corresponding to the DOM subtree root indicated
   * by `parentElement`.
   * 
   * This function is intended for use on segments of HTML markup that are not directly derived
   * from a structure publication of the kind supported by `PublicationTree`.  It may be used to
   * produce a table of contents from the contents of a kind `30041` event with AsciiDoc markup, or
   * from a kind `30023` event with Markdown content.
   */
  buildTocFromDocument(
    parentElement: HTMLElement,
    parentEntry: TocEntry,
    depth: number = 1
  ) {
    parentElement
      .querySelectorAll<HTMLHeadingElement>(`h${depth}`)
      .forEach((header) => {
        const title = header.textContent?.trim();
        const id = header.id;

        // Only create an entry if the header has an ID and a title.
        if (id && title) {
          const href = `${this.#pagePathname}#${id}`;

          const tocEntry: TocEntry = {
            address: parentEntry.address,
            title,
            href,
            depth,
            children: [],
          };
          parentEntry.children.push(tocEntry);

          this.buildTocFromDocument(header, tocEntry, depth + 1);
        }
      });
  }

  // #endregion

  // #region Iterator Methods

  /**
   * Iterates over all ToC entries in depth-first order.
   */
  *[Symbol.iterator](): IterableIterator<TocEntry> {
    function* traverse(entry: TocEntry | null): IterableIterator<TocEntry> {
      if (!entry) {
        return;
      }

      yield entry;

      if (entry.children) {
        for (const child of entry.children) {
          yield* traverse(child);
        }
      }
    }

    yield* traverse(this.#root);
  }

  // #endregion

  // #region Private Methods

  async #initRoot(rootAddress: string) {
    const rootEvent = await this.#publicationTree.getEvent(rootAddress);
    if (!rootEvent) {
      throw new Error(`[ToC] Root event ${rootAddress} not found.`);
    }

    this.#root = {
      address: rootAddress,
      title: this.#getTitle(rootEvent),
      children: [],
      depth: 0,
    };

    this.addressMap.set(rootAddress, this.#root);
    // Handle any other nodes that have already been resolved.
    await this.#handleNodeResolved(rootAddress);
  }

  async #handleNodeResolved(address: string) {
    if (this.addressMap.has(address)) {
      return;
    }
    const event = await this.#publicationTree.getEvent(address);
    if (!event) {
      return;
    }

    const parentEvent = await this.#publicationTree.getParent(address);
    const parentAddress = parentEvent?.tagAddress();
    if (!parentAddress) {
      // All non-root nodes must have a parent.
      if (!this.#root || address !== this.#root.address) {
        throw new Error(`[ToC] Parent not found for address ${address}`);
      }
      return;
    }

    const parentEntry = this.addressMap.get(parentAddress);
    if (!parentEntry) {
      throw new Error(`[ToC] Parent ToC entry not found for address ${address}`);
    }

    const entry: TocEntry = {
      address,
      title: this.#getTitle(event),
      children: [],
      parent: parentEntry,
      depth: parentEntry.depth + 1,
    };

    // Michael J - 05 June 2025 - The `getChildAddresses` method forces node resolution on the
    // publication tree.  This is acceptable here, because the tree is always resolved top-down.
    // Therefore, by the time we handle a node's resolution, its parent and siblings have already
    // been resolved.
    const childAddresses = await this.#publicationTree.getChildAddresses(parentAddress);
    const filteredChildAddresses = childAddresses.filter((a): a is string => !!a);
    const insertIndex = filteredChildAddresses.findIndex(a => a === address);
    if (insertIndex === -1 || insertIndex > parentEntry.children.length) {
      parentEntry.children.push(entry);
    } else {
      parentEntry.children.splice(insertIndex, 0, entry);
    }
    
    this.addressMap.set(address, entry);
  }

  #getTitle(event: NDKEvent | null): string {
    if (!event) {
      // TODO: What do we want to return in this case?
      return '[untitled]';
    }
    const titleTag = event.getMatchingTags?.('title')?.[0]?.[1];
    return titleTag || event.tagAddress() || '[untitled]';
  }

  #normalizeHashPath(title: string): string {
    // TODO: Confirm this uses good normalization logic to produce unique hrefs within the page.
    return title.toLowerCase().replace(/ /g, '-');
  }

  // #endregion
}
