<!--
  NodeTooltip Component
  
  Displays detailed information about a node when hovering or clicking on it
  in the event network visualization.
-->
<script lang="ts">
  import type { NetworkNode } from "./types";
  import { onMount } from "svelte";
  import { getMatchingTags } from '$lib/utils/nostrUtils';
  
  // Component props
  let { node, selected = false, x, y, onclose } = $props<{
    node: NetworkNode;       // The node to display information for
    selected?: boolean;      // Whether the node is selected (clicked)
    x: number;               // X position for the tooltip
    y: number;               // Y position for the tooltip
    onclose: () => void;     // Function to call when closing the tooltip
  }>();
  
  // DOM reference and positioning
  let tooltipElement: HTMLDivElement;
  let tooltipX = $state(x + 10); // Add offset to avoid cursor overlap
  let tooltipY = $state(y - 10);
  
  // Maximum content length to display
  const MAX_CONTENT_LENGTH = 200;
  
  /**
   * Gets the author name from the event tags
   */
  function getAuthorTag(node: NetworkNode): string {
    if (node.event) {
      const authorTags = getMatchingTags(node.event, "author");
      if (authorTags.length > 0) {
        return authorTags[0][1];
      }
    }
    return "Unknown";
  }
  
  /**
   * Gets the summary from the event tags
   */
  function getSummaryTag(node: NetworkNode): string | null {
    if (node.event) {
      const summaryTags = getMatchingTags(node.event, "summary");
      if (summaryTags.length > 0) {
        return summaryTags[0][1];
      }
    }
    return null;
  }
  
  /**
   * Gets the d-tag from the event
   */
  function getDTag(node: NetworkNode): string {
    if (node.event) {
      const dTags = getMatchingTags(node.event, "d");
      if (dTags.length > 0) {
        return dTags[0][1];
      }
    }
    return "View Publication";
  }
  
  /**
   * Truncates content to a maximum length
   */
  function truncateContent(content: string, maxLength: number = MAX_CONTENT_LENGTH): string {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }
  
  /**
   * Closes the tooltip
   */
  function closeTooltip() {
    onclose();
  }
  
  /**
   * Ensures tooltip is fully visible on screen
   */
  onMount(() => {
    if (tooltipElement) {
      const rect = tooltipElement.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const padding = 10; // Padding from window edges
      
      // Adjust position if tooltip goes off screen
      if (rect.right > windowWidth) {
        tooltipX = windowWidth - rect.width - padding;
      }
      
      if (rect.bottom > windowHeight) {
        tooltipY = windowHeight - rect.height - padding;
      }
      
      if (rect.left < 0) {
        tooltipX = padding;
      }
      
      if (rect.top < 0) {
        tooltipY = padding;
      }
    }
  });
</script>

<div
  bind:this={tooltipElement}
  class="tooltip-leather"
  style="left: {tooltipX}px; top: {tooltipY}px;"
>
  <!-- Close button -->
  <button 
    class="tooltip-close-btn"
    onclick={closeTooltip}
    aria-label="Close"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
    </svg>
  </button>
  
  <!-- Tooltip content -->
  <div class="tooltip-content">
    <!-- Title with link -->
    <div class="tooltip-title">
      <a 
        href="/publication?id={node.id}" 
        class="tooltip-title-link"
      >
        {node.title || "Untitled"}
      </a>
    </div>
    
    <!-- Node type and kind -->
    <div class="tooltip-metadata">
      {node.type} (kind: {node.kind})
    </div>
    
    <!-- Author -->
    <div class="tooltip-metadata">
      Author: {getAuthorTag(node)}
    </div>

    <!-- Summary (for index nodes) -->
    {#if node.isContainer && getSummaryTag(node)}
      <div class="tooltip-summary">
        <span class="font-semibold">Summary:</span> {truncateContent(getSummaryTag(node) || "")}
      </div>
    {/if}

    <!-- Content preview -->
    {#if node.content}
      <div class="tooltip-content-preview">
        {truncateContent(node.content)}
      </div>
    {/if}
    
    <!-- Help text for selected nodes -->
    {#if selected}
      <div class="tooltip-help-text">
        Click node again to dismiss
      </div>
    {/if}
  </div>
</div>
