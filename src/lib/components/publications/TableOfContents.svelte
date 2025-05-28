<script lang='ts'>
  import type { TableOfContents } from '$lib/components/publications/table_of_contents.svelte';
  import { getContext } from 'svelte';
  import { Card } from 'flowbite-svelte';

  let { rootAddress } = $props<{ rootAddress: string }>();

  let toc = getContext('toc') as TableOfContents;

  // TODO: Check root address against ToC root address for correctness.

  // Determine the event kind.
  // If index, use the publication tree to build the table of contents.
  // If single event, build the table of contents from the rendered HTML.
  // Each rendered `<h>` should receive an entry in the ToC.
</script>

<Card class='flex flex-col space-y-2'>
  {#each toc as entry}
    <a href={entry.href}>{entry.title}</a>
  {/each}
</Card>
