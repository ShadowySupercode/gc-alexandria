import { PublicationTree } from "../../data_structures/publication_tree.ts";

export interface TocEntry {
  address: string;
  title: string;
  href: string;
  depth: number;
  expanded: boolean;
  children: Array<TocEntry> | null;
}

export class TableOfContents {
  #tocRoot: TocEntry | null = null;
  #addresses = $state<Map<string, TocEntry>>(new Map());
  #publicationTree: PublicationTree;
  #pagePathname: string;

  /**
   * Constructor for the `TableOfContents` class.  The constructed ToC initially contains only the
   * root entry.  Additional entries must be inserted programmatically using class methods.
   *
   * The `TableOfContents` class should be instantiated as a page-scoped singleton so that
   * `pagePathname` is correct wherever the instance is used.  The singleton should be made
   * made available to the entire component tree under that page.
   */
  constructor(rootAddress: string, publicationTree: PublicationTree, pagePathname: string) {
    this.#publicationTree = publicationTree;
    this.#pagePathname = pagePathname;

    this.insertIntoTocFromPublicationTree(rootAddress);
  }

  #normalizeHashPath(title: string): string {
    // TODO: Confirm this uses good normalization logic to produce unique hrefs within the page.
    return title.toLowerCase().replace(/ /g, '-');
  }

  get addresses(): Map<string, TocEntry> {
    return this.#addresses;
  }

  async insertIntoTocFromPublicationTree(address: string): Promise<void> {
    const targetEvent = await this.#publicationTree.getEvent(address);
    if (!targetEvent) {
      console.warn(`[ToC] Event ${address} not found.`);
      // TODO: Determine how to handle this case in the UI.
      return;
    }

    const hierarchyEvents = await this.#publicationTree.getHierarchy(address);
    if (hierarchyEvents.length === 0) {
      // This means we are at root.
      return;
    }

    // Michael J 05 May 2025 - In this loop, we assume that the parent of the current event has
    // already been populated into the ToC.  As long as the root is set when the component is
    // initialized, this code will work fine.
    let currentParentTocNode: TocEntry | null = this.#tocRoot;
    for (let i = 0; i < hierarchyEvents.length; i++) {
      const currentEvent = hierarchyEvents[i];
      const currentAddress = currentEvent.tagAddress();

      if (this.#addresses.has(currentAddress)) {
        continue;
      }

      const currentEventChildAddresses = await this.#publicationTree.getChildAddresses(currentAddress);
      for (const address of currentEventChildAddresses) {
        if (address === null) {
          continue;
        }

        const childEvent = await this.#publicationTree.getEvent(address);
        if (!childEvent) {
          console.warn(`[ToC] Event ${address} not found.`);
          continue;
        }

        currentParentTocNode!.children ??= [];

        const childTocEntry: TocEntry = {
          address,
          title: childEvent.getMatchingTags('title')[0][1],
          href: `${this.#pagePathname}#${this.#normalizeHashPath(childEvent.getMatchingTags('title')[0][1])}`,
          depth: i + 1,
          expanded: false,
          children: null,
        };
        currentParentTocNode!.children.push(childTocEntry);
        this.#addresses.set(address, childTocEntry);
      }

      currentParentTocNode = this.#addresses.get(currentAddress)!;
    }
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
            expanded: false,
            children: null,
          };
          parentEntry.children ??= [];
          parentEntry.children.push(tocEntry);

          this.buildTocFromDocument(header, tocEntry, depth + 1);
        }
      });
  }

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

    yield* traverse(this.#tocRoot);
  }
}
