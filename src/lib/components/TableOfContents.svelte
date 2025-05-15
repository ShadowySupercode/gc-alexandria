<script lang='ts'>
  import type { PublicationTree } from '$lib/data_structures/publication_tree';
  import type { TocEntry } from '$lib/data_structures/table_of_contents';
  import { getContext } from 'svelte';

  let { rootAddress } = $props<{ rootAddress: string }>();

  // Determine the event kind.
  // If index, use the publication tree to build the table of contents.
  // If single event, build the table of contents from the rendered HTML.
  // Each rendered `<h>` should receive an entry in the ToC.

  let toc = $state<TocEntry[]>([]);

	const publicationTree = getContext('publicationTree') as PublicationTree;
</script>

<!-- TODO: Add contents. -->
