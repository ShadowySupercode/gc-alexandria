<script lang="ts">
  import type { NetworkNode } from "./types";
  import { onMount } from "svelte";
  
  let { node, selected = false, x, y } = $props<{
    node: NetworkNode;
    selected?: boolean;
    x: number;
    y: number;
  }>();
  
  let tooltipElement: HTMLDivElement;
  let tooltipX = $state(x + 10);
  let tooltipY = $state(y - 10);
  
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
  
  function truncateContent(content: string, maxLength: number = 200): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }
  
  // Ensure tooltip is fully visible on screen
  onMount(() => {
    if (tooltipElement) {
      const rect = tooltipElement.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Check if tooltip goes off the right edge
      if (rect.right > windowWidth) {
        tooltipX = windowWidth - rect.width - 10;
      }
      
      // Check if tooltip goes off the bottom edge
      if (rect.bottom > windowHeight) {
        tooltipY = windowHeight - rect.height - 10;
      }
      
      // Check if tooltip goes off the left edge
      if (rect.left < 0) {
        tooltipX = 10;
      }
      
      // Check if tooltip goes off the top edge
      if (rect.top < 0) {
        tooltipY = 10;
      }
    }
  });
</script>

<div
  bind:this={tooltipElement}
  class="tooltip-leather fixed p-4 rounded shadow-lg bg-primary-0 dark:bg-primary-800
         border border-gray-200 dark:border-gray-800 transition-colors duration-200"
  style="left: {tooltipX}px; top: {tooltipY}px; z-index: 1000;"
>
  <div class="space-y-2">
    <div class="font-bold text-base">
      <a href="/publication?id={node.id}" class="text-gray-800 hover:text-primary-400 dark:text-gray-300 dark:hover:text-primary-500">
        {node.title}
      </a>
    </div>
    <div class="text-gray-600 dark:text-gray-400 text-sm">
      {node.type} ({node.isContainer ? "30040" : "30041"})
    </div>
    <div class="text-gray-600 dark:text-gray-400 text-sm">
      Author: {getAuthorTag(node)}
    </div>

    {#if node.content}
      <div
        class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-40"
      >
        {truncateContent(node.content)}
      </div>
    {/if}
    {#if selected}
      <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Click node again to dismiss
      </div>
    {/if}
  </div>
</div>
