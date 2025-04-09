<script lang="ts">
  import type { NetworkNode } from "./types";
  import { onMount, createEventDispatcher } from "svelte";
  
  let { node, selected = false, x, y } = $props<{
    node: NetworkNode;
    selected?: boolean;
    x: number;
    y: number;
  }>();
  
  const dispatch = createEventDispatcher();
  
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
  
  function getSummaryTag(node: NetworkNode): string | null {
    if (node.event) {
      const summaryTags = node.event.getMatchingTags("summary");
      if (summaryTags.length > 0) {
        return summaryTags[0][1];
      }
    }
    return null;
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
  
  function closeTooltip() {
    dispatch('close');
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
  style="left: {tooltipX}px; top: {tooltipY}px; z-index: 1000; max-width: 400px;"
>
  <button 
    class="absolute top-2 left-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    onclick={closeTooltip}
    aria-label="Close"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
    </svg>
  </button>
  <div class="space-y-2 pl-6">
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

    {#if node.isContainer && getSummaryTag(node)}
      <div class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-40">
        <span class="font-semibold">Summary:</span> {truncateContent(getSummaryTag(node) || "", 200)}
      </div>
    {/if}

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
