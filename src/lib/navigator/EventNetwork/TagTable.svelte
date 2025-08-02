<!--
  TagTable Component
  Displays a table of unique tags found in the event network
-->
<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { Table } from "flowbite-svelte";
  
  let { events = [], selectedTagType = "t" } = $props<{
    events: NDKEvent[];
    selectedTagType: string;
  }>();

  // Computed property for unique tags
  let uniqueTags = $derived.by(() => {
    const tagMap = new Map<string, { value: string; count: number; firstEvent: string }>();
    
    events.forEach((event: NDKEvent) => {
      const tags = event.tags || [];
      tags.forEach((tag: string[]) => {
        if (tag[0] === selectedTagType) {
          const tagValue = tag[1];
          const count = tagMap.get(tagValue)?.count || 0;
          tagMap.set(tagValue, {
            value: tagValue,
            count: count + 1,
            // Store first event that references this tag
            firstEvent: tagMap.get(tagValue)?.firstEvent || event.id
          });
        }
      });
    });

    return Array.from(tagMap.values())
      .sort((a, b) => b.count - a.count); // Sort by frequency
  });

  // Tag type labels for display
  const tagTypeLabels: Record<string, string> = {
    't': 'Hashtags',
    'author': 'Authors',
    'p': 'People',
    'e': 'Events',
    'title': 'Titles',
    'summary': 'Summaries'
  };
</script>

{#if uniqueTags.length > 0}
  <div class="tag-table-container p-4">
    <h3 class="text-lg font-semibold mb-2">
      {tagTypeLabels[selectedTagType] || 'Tags'}
    </h3>
    <Table hoverable>
      <thead>
        <tr>
          <th>Tag</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {#each uniqueTags as tag}
          <tr>
            <td>{tag.value}</td>
            <td>{tag.count}</td>
          </tr>
        {/each}
      </tbody>
    </Table>
  </div>
{:else}
  <div class="p-4 text-gray-500">
    No {tagTypeLabels[selectedTagType]?.toLowerCase() || 'tags'} found
  </div>
{/if}

<style>
  .tag-table-container {
    max-height: 300px;
    overflow-y: auto;
  }
</style>