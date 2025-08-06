import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { SveltePublicationTree } from "./svelte_publication_tree.svelte.ts";
import type { NDKEvent } from "../../utils/nostrUtils.ts";
import { indexKind } from "../../consts.ts";

type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;

export interface TocEntry {
  address: string;
  title: string;
  href?: string;
  children: TocEntry[];
  parent?: TocEntry;
  depth: number;
  childrenResolved: boolean;
  resolveChildren: () => Promise<void>;
}

/**
 * Maintains a table of contents (ToC) for a `SveltePublicationTree`.  Since publication trees are
 * conceptually infinite and lazy-loading, the ToC represents only the portion of the tree that has
 * been "discovered".  The ToC is updated as new nodes are resolved within the publication tree.
 * 
 * Implements the Svelte store contract, allowing components to subscribe to changes in the ToC 
 * state.
 *
 * @see SveltePublicationTree
 * @see https://svelte.dev/docs/svelte/stores#Store-contract
 */
export class TableOfContents {
  public addressMap: SvelteMap<string, TocEntry> = new SvelteMap();
  public expandedMap: SvelteMap<string, boolean> = new SvelteMap();
  public leaves: SvelteSet<string> = new SvelteSet();

  #root: TocEntry | null = null;
  #publicationTree: SveltePublicationTree;
  #pagePathname: string;
  #subscribers: Set<Subscriber<TableOfContents>> = new Set();

  /**
   * Constructs a `TableOfContents` from a `SveltePublicationTree`.
   *
   * @param rootAddress The address of the root event.
   * @param publicationTree The SveltePublicationTree instance.
   * @param pagePathname The current page pathname for href generation.
   */
  constructor(
    rootAddress: string,
    publicationTree: SveltePublicationTree,
    pagePathname: string,
  ) {
    this.#publicationTree = publicationTree;
    this.#pagePathname = pagePathname;
    this.#init(rootAddress);
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
   * Sets the expanded state for a ToC entry.
   *
   * @param address The address of the entry to modify.
   * @param expanded Whether the entry should be expanded.
   */
  setExpanded(address: string, expanded: boolean): void {
    this.expandedMap.set(address, expanded);
    this.#notifySubscribers();
  }

  /**
   * Toggles the expanded state for a ToC entry.
   *
   * @param address The address of the entry to toggle.
   */
  toggleExpanded(address: string): void {
    const currentState = this.expandedMap.get(address) ?? false;
    this.setExpanded(address, !currentState);
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
  buildTocFromDocument(parentElement: HTMLElement, parentEntry: TocEntry) {
    parentElement
      .querySelectorAll<HTMLHeadingElement>(`h${parentEntry.depth}`)
      .forEach((header) => {
        // TODO: Correctly update ToC state from DOM.
        const title = header.textContent?.trim();
        const id = header.id;

        // Only create an entry if the header has an ID and a title.
        if (id && title) {
          const href = `${this.#pagePathname}#${id}`;

          // TODO: Check this logic.
          const tocEntry: TocEntry = {
            address: parentEntry.address,
            title,
            href,
            depth: parentEntry.depth + 1,
            children: [],
            childrenResolved: true,
            resolveChildren: () => Promise.resolve(),
          };
          parentEntry.children.push(tocEntry);
          this.expandedMap.set(tocEntry.address, false);
          this.#notifySubscribers();

          this.buildTocFromDocument(header, tocEntry);
        }
      });
  }

  // #endregion

  // #region Store Contract Methods

  /**
   * Subscribes to changes in the table of contents state.
   * Implements the Svelte store contract.
   *
   * @param subscriber Function to be called with the current state on subscription and state changes.
   * @returns Unsubscriber function to stop the subscription.
   */
  subscribe(subscriber: Subscriber<TableOfContents>): Unsubscriber {
    this.#subscribers.add(subscriber);
    
    // Immediately call subscriber with current state (store contract requirement)
    subscriber(this.#getCurrentState());
    
    // Return unsubscriber function
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  /**
   * Gets the current state of the table of contents.
   * Used by the store contract implementation.
   *
   * @returns The current TocState.
   */
  #getCurrentState(): TableOfContents {
    return this;
  }

  /**
   * Notifies all subscribers of state changes.
   * Called whenever the table of contents state is modified.
   */
  #notifySubscribers(): void {
    const currentState = this.#getCurrentState();
    this.#subscribers.forEach((subscriber) => {
      subscriber(currentState);
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

  /**
   * Initializes the ToC from the associated publication tree.
   *
   * @param rootAddress The address of the publication's root event.
   *
   * Michael J - 07 July 2025 - NOTE: Since the publication tree is conceptually infinite and
   * lazy-loading, the ToC is not guaranteed to contain all the nodes at any layer until the
   * publication has been fully resolved.
   *
   * Michael J - 07 July 2025 - TODO: If the relay provides event metadata, use the metadata to
   * initialize the ToC with all of its first-level children.
   */
  async #init(rootAddress: string) {
    const rootEvent = await this.#publicationTree.getEvent(rootAddress);
    if (!rootEvent) {
      throw new Error(`[ToC] Root event ${rootAddress} not found.`);
    }

    this.#root = await this.#buildTocEntry(rootAddress);

    this.addressMap.set(rootAddress, this.#root);
    this.#notifySubscribers();

    // Handle any other nodes that have already been resolved in parallel.
    await Promise.all(
      Array.from(this.#publicationTree.resolvedAddresses).map((address) =>
        this.#buildTocEntryFromResolvedNode(address),
      ),
    );

    // Set up an observer to handle progressive resolution of the publication tree.
    this.#publicationTree.onNodeResolved((address: string) => {
      this.#buildTocEntryFromResolvedNode(address);
    });
  }

  #getTitle(event: NDKEvent | null): string {
    if (!event) {
      // TODO: What do we want to return in this case?
      return "[untitled]";
    }
    const titleTag = event.getMatchingTags?.("title")?.[0]?.[1];
    return titleTag || event.tagAddress() || "[untitled]";
  }

  async #buildTocEntry(address: string): Promise<TocEntry> {
    // Michael J - 07 July 2025 - NOTE: This arrow function is nested so as to use its containing
    // scope in its operation. Do not move it to the top level without ensuring it still has access
    // to the necessary variables.
    const resolver = async () => {
      if (entry.childrenResolved) {
        return;
      }

      const event = await this.#publicationTree.getEvent(entry.address);
      if (event?.kind !== indexKind) {
        // TODO: Build ToC entries from HTML markup in this case.
        return;
      }

      const childAddresses = await this.#publicationTree.getChildAddresses(
        entry.address,
      );
      for (const childAddress of childAddresses) {
        if (!childAddress) {
          continue;
        }

        // Michael J - 16 June 2025 - This duplicates logic in the outer function, but is necessary
        // here so that we can determine whether to render an entry as a leaf before it is fully
        // resolved.
        if (childAddress.split(":")[0] !== indexKind.toString()) {
          this.leaves.add(childAddress);
          this.#notifySubscribers();
        }

        // Michael J - 05 June 2025 - The `getChildAddresses` method forces node resolution on the
        // publication tree.  This is acceptable here, because the tree is always resolved
        // top-down.  Therefore, by the time we handle a node's resolution, its parent and
        // siblings have already been resolved.
        const childEntry = await this.#buildTocEntry(childAddress);
        childEntry.parent = entry;
        childEntry.depth = entry.depth + 1;
        entry.children.push(childEntry);
        this.addressMap.set(childAddress, childEntry);
        this.#notifySubscribers();
      }

      await this.#matchChildrenToTagOrder(entry);

      entry.childrenResolved = true;
    };

    const event = await this.#publicationTree.getEvent(address);
    if (!event) {
      throw new Error(`[ToC] Event ${address} not found.`);
    }

    const depth = (await this.#publicationTree.getHierarchy(address)).length;

    const entry: TocEntry = {
      address,
      title: this.#getTitle(event),
      href: `${this.#pagePathname}#${address}`,
      children: [],
      depth,
      childrenResolved: false,
      resolveChildren: resolver,
    };
    this.expandedMap.set(address, false);
    this.#notifySubscribers();

    // Michael J - 16 June 2025 - We determine whether to add a leaf both here and in the inner
    // resolver function.  The resolver function is called when entries are resolved by expanding
    // a ToC entry, and we'll reach the block below when entries are resolved by the publication
    // tree.
    if (event.kind !== indexKind) {
      this.leaves.add(address);
      this.#notifySubscribers();
    }

    return entry;
  }

  /**
   * Reorders the children of a ToC entry to match the order of 'a' tags in the corresponding
   * Nostr index event.
   *
   * @param entry The ToC entry to reorder.
   *
   * This function has a time complexity of `O(n log n)`, where `n` is the number of children the
   * parent event has. Average size of `n` is small enough to be negligible.
   */
  async #matchChildrenToTagOrder(entry: TocEntry) {
    const parentEvent = await this.#publicationTree.getEvent(entry.address);
    if (parentEvent?.kind === indexKind) {
      const tagOrder = parentEvent.getMatchingTags("a").map((tag) => tag[1]);
      const addressToOrdinal = new Map<string, number>();

      // Build map of addresses to their ordinals from tag order
      tagOrder.forEach((address, index) => {
        addressToOrdinal.set(address, index);
      });

      entry.children.sort((a, b) => {
        const aOrdinal =
          addressToOrdinal.get(a.address) ?? Number.MAX_SAFE_INTEGER;
        const bOrdinal =
          addressToOrdinal.get(b.address) ?? Number.MAX_SAFE_INTEGER;
        return aOrdinal - bOrdinal;
      });
    }
  }

  #buildTocEntryFromResolvedNode(address: string) {
    if (this.addressMap.has(address)) {
      return;
    }

    this.#buildTocEntry(address).then((entry) => {
      this.addressMap.set(address, entry);
      this.#notifySubscribers();
    });
  }

  // #endregion
}
