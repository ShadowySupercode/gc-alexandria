<script lang='ts'>
  import { onMount } from 'svelte';
  
  let { content, noteId, isExpanded = false, onToggle, children } = $props<{
    content: string;
    noteId: string;
    isExpanded?: boolean;
    onToggle: (noteId: string) => void;
    children: any;
  }>();
  
  // Track if content needs expansion
  let needsExpansion = $state(false);
  let contentElement: HTMLElement;
  
  // Function to check if content is truncated and needs a "Show more" button
  function checkContentHeight(): void {
    if (contentElement) {
      // If the content is taller than 500px (our truncation height), mark it as needing expansion
      needsExpansion = contentElement.scrollHeight > 500;
    }
  }
  
  onMount(() => {
    // Check height after the element is rendered
    setTimeout(checkContentHeight, 0);
  });
</script>

<style>
  /* Content container styles */
  .content-container {
    position: relative;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
  }
  
  .content-container.truncated {
    max-height: 500px; /* Limit height to 500px */
  }
  
  .content-container.expanded {
    max-height: none; /* No height limit when expanded */
  }
  
  /* Show more button styles */
  .show-more-container {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }
  
  .show-more-button {
    background-color: transparent;
    color: var(--color-primary-500);
    font-weight: 500;
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--color-primary-200);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .show-more-button:hover {
    background-color: var(--color-primary-50);
    color: var(--color-primary-600);
  }
  
  /* Add gradient fade for truncated content */
  .content-container.truncated::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 80px;
    background: linear-gradient(to bottom, transparent, var(--color-gray-50));
    pointer-events: none;
  }
  
  /* Dark mode support for the gradient */
  :global(.dark) .content-container.truncated::after {
    background: linear-gradient(to bottom, transparent, var(--color-gray-800));
  }
</style>

<div 
  class="content-container" 
  class:truncated={!isExpanded} 
  class:expanded={isExpanded}
  bind:this={contentElement}
>
  {@render children()}
</div>

<!-- Show more button - only if content is truncated -->
{#if needsExpansion}
  <div class="show-more-container">
    <button 
      class="show-more-button"
      onclick={() => onToggle(noteId)}
    >
      {isExpanded ? 'Show less' : 'Show more...'}
    </button>
  </div>
{/if}
