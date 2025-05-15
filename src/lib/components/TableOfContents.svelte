<script lang='ts'>
  import type { PublicationTree } from '$lib/data_structures/publication_tree';
  import type { TocEntry } from '$lib/data_structures/table_of_contents';
  import { getContext } from 'svelte';

  let { rootAddress } = $props<{ rootAddress: string }>();

  let toc = $state<TocEntry[]>([]);

	const publicationTree = getContext('publicationTree') as PublicationTree;

  // TODO: Build the table of contents.
  // Base hrefs on d-tags for events within the publication.
</script>

<!-- TODO: Add contents. -->
