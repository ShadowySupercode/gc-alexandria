<script lang="ts">
  import type { NetworkNode } from "./types";
  
  export let node: NetworkNode;
  export let selected: boolean = false;
  export let x: number;
  export let y: number;
  
  function getAuthorTag(node: NetworkNode): string {
    if (node.event) {
      const authorTags = node.event.getMatchingTags("author");
      if (authorTags.length > 0) {
        return authorTags[0][1];
      }
    }
    return "Unknown";
  }
  
  function getDTag(node: NetworkNode): string {
    if (node.event) {
      const dTags = node.event.getMatchingTags("d");
      if (dTags.length > 0) {
        return dTags[0][1];
      }
    }
    return "View Publication";
  }
</script>

<div
  class="tooltip-leather fixed p-4 rounded shadow-lg bg-primary-0 dark:bg-primary-800
         border border-gray-200 dark:border-gray-800 transition-colors duration-200"
  style="left: {x + 10}px; top: {y - 10}px; z-index: 1000;"
>
  <div class="space-y-2">
    <div class="font-bold text-base">{node.title}</div>
    <div class="text-gray-600 dark:text-gray-400 text-sm">
      {node.type} ({node.isContainer ? "30040" : "30041"})
    </div>
    <div class="text-gray-600 dark:text-gray-400 text-sm">
      Author: {getAuthorTag(node)}
    </div>
    <div class="text-gray-600 dark:text-gray-400 text-sm">
      <a href="/publication?id={node.id}" class="text-blue-500 hover:underline">
        {getDTag(node)}
      </a>
    </div>
    {#if node.content}
      <div
        class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-40"
      >
        {node.content}
      </div>
    {/if}
    {#if selected}
      <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Click node again to dismiss
      </div>
    {/if}
  </div>
</div>
