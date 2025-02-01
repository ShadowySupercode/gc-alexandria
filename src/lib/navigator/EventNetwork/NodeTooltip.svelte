<script lang="ts">
  import type { NetworkNode } from "./types";
  
  export let node: NetworkNode;
  export let selected: boolean = false;
  export let x: number;
  export let y: number;
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
    <div
      class="text-gray-600 dark:text-gray-400 text-sm overflow-hidden text-ellipsis"
    >
      ID: {node.id}
      {#if node.naddr}
        <div>{node.naddr}</div>
      {/if}
      {#if node.nevent}
        <div>{node.nevent}</div>
      {/if}
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