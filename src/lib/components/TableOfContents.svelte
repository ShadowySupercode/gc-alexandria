<script lang='ts'>
  import { page } from '$app/state';
  import type { PublicationTree } from '$lib/data_structures/publication_tree';
  import type { TocEntry } from '$lib/data_structures/table_of_contents';
  import { getContext } from 'svelte';

  let { rootAddress } = $props<{ rootAddress: string }>();

  // Determine the event kind.
  // If index, use the publication tree to build the table of contents.
  // If single event, build the table of contents from the rendered HTML.
  // Each rendered `<h>` should receive an entry in the ToC.

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
            expanded: false, // Default to not expanded; can be changed as needed.
            children: null,  // These are leaf entries from a flat scan of headers.
          };
          entries.push(tocEntry);
        }
      });

    // TODO: Update ToC state within the component.
  }

  let toc = $state<TocEntry[]>([]);

	const publicationTree = getContext('publicationTree') as PublicationTree;
</script>

<!-- TODO: Add contents. -->
