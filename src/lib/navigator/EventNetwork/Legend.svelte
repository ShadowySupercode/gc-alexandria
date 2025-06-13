<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { getEventKindColor, getEventKindName } from '$lib/utils/eventColors';

  // TODO: Move this to settings panel for user control
  const TAG_LEGEND_COLUMNS = 4; // Number of columns for tag anchor table
  let {
    collapsedOnInteraction = false,
    className = "",
    starMode = false,
    showTags = false,
    tagAnchors = [],
    eventCounts = {},
    disabledTags = new Set<string>(),
    onTagToggle = (tagId: string) => {},
    autoDisabledTags = false,
  } = $props<{
    collapsedOnInteraction: boolean;
    className: string;
    starMode?: boolean;
    showTags?: boolean;
    tagAnchors?: any[];
    eventCounts?: { [kind: number]: number };
    disabledTags?: Set<string>;
    onTagToggle?: (tagId: string) => void;
    autoDisabledTags?: boolean;
  }>();

  let expanded = $state(true);
  let nodeTypesExpanded = $state(true);
  let tagAnchorsExpanded = $state(true);

  $effect(() => {
    if (collapsedOnInteraction) {
      expanded = false;
    }
  });

  function toggle() {
    expanded = !expanded;
  }
  
  function toggleNodeTypes() {
    nodeTypesExpanded = !nodeTypesExpanded;
  }
  
  function toggleTagAnchors() {
    tagAnchorsExpanded = !tagAnchorsExpanded;
  }
</script>

<div class={`leather-legend ${className}`}>
  <div class="flex items-center justify-between space-x-3">
    <h3 class="h-leather">Legend</h3>
    <Button
      color="none"
      outline
      size="xs"
      onclick={toggle}
      class="rounded-full"
    >
      {#if expanded}
        <CaretUpOutline />
      {:else}
        <CaretDownOutline />
      {/if}
    </Button>
  </div>

  {#if expanded}
    <div class="legend-content">
      <!-- Node Types Section -->
      <div class="legend-section">
        <div class="legend-section-header" onclick={toggleNodeTypes}>
          <h4 class="legend-section-title">Node Types</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if nodeTypesExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        
        {#if nodeTypesExpanded}
          <ul class="legend-list">
            <!-- Dynamic event kinds -->
            {#each Object.entries(eventCounts).sort(([a], [b]) => Number(a) - Number(b)) as [kindStr, count]}
              {@const kind = Number(kindStr)}
              {@const color = getEventKindColor(kind)}
              {@const name = getEventKindName(kind)}
              {#if count > 0}
                <li class="legend-item">
                  <div class="legend-icon">
                    <span
                      class="legend-circle"
                      style="background-color: {color}"
                    >
                    </span>
                  </div>
                  <span class="legend-text">
                    {kind} - {name} ({count})
                  </span>
                </li>
              {/if}
            {/each}

            <!-- Connection lines -->
            <li class="legend-item">
              <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
                <path
                  d="M4 12h16M16 6l6 6-6 6"
                  class="network-link-leather"
                  stroke-width="2"
                  fill="none"
                />
              </svg>
              <span class="legend-text">
                {#if starMode}
                  Radial connections from centers to related events
                {:else}
                  Arrows indicate relationships and sequence
                {/if}
              </span>
            </li>
          </ul>
        {/if}
      </div>

      <!-- Tag Anchors section -->
      {#if showTags && tagAnchors.length > 0}
        <div class="legend-section">
          <div class="legend-section-header" onclick={toggleTagAnchors}>
            <h4 class="legend-section-title">Active Tag Anchors: {tagAnchors[0].type}</h4>
            <Button
              color="none"
              outline
              size="xs"
              class="rounded-full p-1"
            >
              {#if tagAnchorsExpanded}
                <CaretUpOutline class="w-3 h-3" />
              {:else}
                <CaretDownOutline class="w-3 h-3" />
              {/if}
            </Button>
          </div>
          
          {#if tagAnchorsExpanded}
            {#if autoDisabledTags}
              <div class="text-xs text-amber-600 dark:text-amber-400 mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                <strong>Note:</strong> All {tagAnchors.length} tags were auto-disabled to prevent graph overload. Click individual tags below to enable them.
              </div>
            {/if}
            <div
              class="tag-grid"
              style="grid-template-columns: repeat({TAG_LEGEND_COLUMNS}, 1fr);"
            >
              {#each tagAnchors as anchor}
                {@const tagId = `${anchor.type}-${anchor.label}`}
                {@const isDisabled = disabledTags.has(tagId)}
                <button
                  class="tag-grid-item {isDisabled ? 'disabled' : ''}"
                  onclick={() => onTagToggle(tagId)}
                  title={isDisabled ? `Click to show ${anchor.label}` : `Click to hide ${anchor.label}`}
                >
                  <div class="legend-icon">
                    <span
                      class="legend-circle"
                      style="background-color: {anchor.color}; width: 18px; height: 18px; border: 2px solid white; opacity: {isDisabled ? 0.3 : 1};"
                    >
                      <span class="legend-letter text-xs text-white font-bold">
                        {anchor.type === "t"
                          ? "#"
                          : anchor.type === "author"
                            ? "A"
                            : anchor.type.charAt(0).toUpperCase()}
                      </span>
                    </span>
                  </div>
                  <span class="legend-text text-xs" style="opacity: {isDisabled ? 0.5 : 1};">
                    {anchor.label}
                    {#if !isDisabled}
                      <span class="text-gray-500">({anchor.count})</span>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .legend-section {
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
  }

  .legend-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .legend-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 0.5rem 0;
    margin-bottom: 0.75rem;
  }

  .legend-section-header:hover {
    background-color: #f9fafb;
    border-radius: 0.375rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .legend-section-title {
    font-weight: 600;
    color: #374151;
    margin: 0;
    font-size: 0.875rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .legend-item:last-child {
    margin-bottom: 0;
  }

  .tag-grid-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
    border: none;
    background: none;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
    width: 100%;
    text-align: left;
  }
  
  .tag-grid-item:hover:not(.disabled) {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .tag-grid-item.disabled {
    cursor: pointer;
  }
  
  .tag-grid-item:hover.disabled {
    background-color: rgba(0, 0, 0, 0.02);
  }
  
  :global(.dark) .legend-section-header:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
  
  :global(.dark) .legend-section-title {
    color: #d1d5db;
  }
  
  :global(.dark) .legend-section {
    border-bottom-color: #374151;
  }
  
  :global(.dark) .tag-grid-item:hover:not(.disabled) {
    background-color: rgba(255, 255, 255, 0.05);
  }
  
  :global(.dark) .tag-grid-item:hover.disabled {
    background-color: rgba(255, 255, 255, 0.02);
  }
</style>
