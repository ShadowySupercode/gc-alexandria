import { PublicationTree } from "../../data_structures/publication_tree.ts";

export interface TocEntry {
  title: string;
  href: string;
  expanded: boolean;
  children: Array<TocEntry> | null;
}

export class TableOfContents {
  tocRoot = $state<TocEntry | null>(null);
  tocAddresses = $state<Map<string, TocEntry>>(new Map());

  publicationTree: PublicationTree;
  pagePathname: string;

  constructor(publicationTree: PublicationTree, pagePathname: string) {
    this.publicationTree = publicationTree;
    this.pagePathname = pagePathname;
  }

  #normalizeHashPath(title: string): string {
    // TODO: Confirm this uses good normalization logic to produce unique hrefs within the page.
    return title.toLowerCase().replace(/ /g, '-');
  }

  async insertIntoTocFromPublicationTree(address: string): Promise<void> {
    const targetEvent = await this.publicationTree.getEvent(address);
    if (!targetEvent) {
      console.warn(`[ToC] Event ${address} not found.`);
      // TODO: Determine how to handle this case in the UI.
      return;
    }

    const hierarchyEvents = await this.publicationTree.getHierarchy(address);
    if (hierarchyEvents.length === 0) {
      // This means we are at root.
      return;
    }

    // Michael J 05 May 2025 - In this loop, we assume that the parent of the current event has
    // already been populated into the ToC.  As long as the root is set when the component is
    // initialized, this code will work fine.
    let currentParentTocNode: TocEntry | null = this.tocRoot;
    for (let i = 0; i < hierarchyEvents.length; i++) {
      const currentEvent = hierarchyEvents[i];
      const currentAddress = currentEvent.tagAddress();

      if (this.tocAddresses.has(currentAddress)) {
        continue;
      }

      const currentEventChildAddresses = await this.publicationTree.getChildAddresses(currentAddress);
      for (const address of currentEventChildAddresses) {
        if (address === null) {
          continue;
        }

        const childEvent = await this.publicationTree.getEvent(address);
        if (!childEvent) {
          console.warn(`[ToC] Event ${address} not found.`);
          continue;
        }

        currentParentTocNode!.children ??= [];

        const childTocEntry: TocEntry = {
          title: childEvent.getMatchingTags('title')[0][1],
          href: `${this.pagePathname}#${this.#normalizeHashPath(childEvent.getMatchingTags('title')[0][1])}`,
          expanded: false,
          children: null,
        };
        currentParentTocNode!.children.push(childTocEntry);
        this.tocAddresses.set(address, childTocEntry);
      }

      currentParentTocNode = this.tocAddresses.get(currentAddress)!;
    }
  }

  buildTocFromDocument(parentElement: HTMLElement): void {
    const entries: TocEntry[] = [];

    parentElement
      .querySelectorAll<HTMLHeadingElement>(
        'h1, h2, h3, h4, h5, h6'
      )
      .forEach((header) => {
        const title = header.textContent?.trim();
        const id = header.id;

        // Only create an entry if the header has an ID and a title.
        if (id && title) {
          const href = `${this.pagePathname}#${id}`;

          const tocEntry: TocEntry = {
            title,
            href,
            expanded: false,
            children: null,
          };
          entries.push(tocEntry);
        }
      });

    // TODO: Update ToC state within the component.
  }
}
