<script lang='ts'>
  import { page } from '$app/state';
  import type { PublicationTree } from '$lib/data_structures/publication_tree';
  import type { TocEntry } from '$lib/data_structures/table_of_contents';
  import { getContext } from 'svelte';

  let { rootAddress } = $props<{ rootAddress: string }>();

  let publicationTree = getContext('publicationTree') as PublicationTree;

  let tocAddresses = $state<Map<string, TocEntry>>(new Map());
  let tocRoot = $state<TocEntry | null>(null);

  // Determine the event kind.
  // If index, use the publication tree to build the table of contents.
  // If single event, build the table of contents from the rendered HTML.
  // Each rendered `<h>` should receive an entry in the ToC.

  function normalizeHashPath(title: string): string {
    // TODO: Confirm this uses good normalization logic to produce unique hrefs within the page.
    return title.toLowerCase().replace(/ /g, '-');
  }

  async function insertIntoTocFromPublicationTree(address: string): Promise<void> {
    const targetEvent = await publicationTree.getEvent(address);
    if (!targetEvent) {
      console.warn(`[ToC] Event ${address} not found.`);
      // TODO: Determine how to handle this case in the UI.
      return;
    }

    const hierarchyEvents = await publicationTree.getHierarchy(address);
    if (hierarchyEvents.length === 0) {
      // This means we are at root.
      return;
    }

    // Michael J 05 May 2025 - In this loop, we assume that the parent of the current event has
    // already been populated into the ToC.  As long as the root is set when the component is
    // initialized, this code will work fine.
    let currentParentTocNode: TocEntry | null = tocRoot;
    for (let i = 0; i < hierarchyEvents.length; i++) {
      const currentEvent = hierarchyEvents[i];
      const currentAddress = currentEvent.tagAddress();

      if (tocAddresses.has(currentAddress)) {
        continue;
      }

      const currentEventChildAddresses = await publicationTree.getChildAddresses(currentAddress);
      for (let address of currentEventChildAddresses) {
        if (address === null) {
          continue;
        }

        const childEvent = await publicationTree.getEvent(address);
        if (!childEvent) {
          console.warn(`[ToC] Event ${address} not found.`);
          continue;
        }

        currentParentTocNode!.children ??= [];

        const childTocEntry: TocEntry = {
          title: childEvent.getMatchingTags('title')[0][1],
          href: `${page.url.pathname}#${normalizeHashPath(childEvent.getMatchingTags('title')[0][1])}`,
          expanded: false,
          children: null,
        };
        currentParentTocNode!.children.push(childTocEntry);
        tocAddresses.set(address, childTocEntry);
      }

      currentParentTocNode = tocAddresses.get(currentAddress)!;
    }
  }

  function buildTocFromDocument(parentElement: HTMLElement): void {
    const entries: TocEntry[] = [];
    const currentPathname = page.url.pathname;

    parentElement
      .querySelectorAll<HTMLHeadingElement>(
        'h1, h2, h3, h4, h5, h6'
      )
      .forEach((header) => {
        const title = header.textContent?.trim();
        const id = header.id;

        // Only create an entry if the header has an ID and a title.
        if (id && title) {
          const href = `${currentPathname}#${id}`;

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
</script>

<!-- TODO: Add contents. -->
