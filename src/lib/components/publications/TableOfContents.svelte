<script lang='ts'>
  import { page } from '$app/state';
  import type { PublicationTree } from '$lib/data_structures/publication_tree';
  import type { TocEntry } from '$lib/components/publications/table_of_contents.svelte';
  import { getContext } from 'svelte';

  let { rootAddress } = $props<{ rootAddress: string }>();

  let publicationTree = getContext('publicationTree') as PublicationTree;

  let tocAddresses = $state<Map<string, TocEntry>>(new Map());
  let tocRoot = $state<TocEntry | null>(null);

  // Determine the event kind.
  // If index, use the publication tree to build the table of contents.
  // If single event, build the table of contents from the rendered HTML.
  // Each rendered `<h>` should receive an entry in the ToC.
</script>

<!-- TODO: Add contents. -->
