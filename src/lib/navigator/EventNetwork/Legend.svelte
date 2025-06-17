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
    showTagAnchors = $bindable(false),
    selectedTagType = $bindable("t"),
    tagExpansionDepth = $bindable(0),
    onTagSettingsChange = () => {},
    showPersonNodes = $bindable(false),
    personAnchors = [],
    disabledPersons = new Set<string>(),
    onPersonToggle = (pubkey: string) => {},
    onPersonSettingsChange = () => {},
    showSignedBy = $bindable(true),
    showReferenced = $bindable(true),
    totalPersonCount = 0,
    displayedPersonCount = 0,
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
    showTagAnchors?: boolean;
    selectedTagType?: string;
    tagExpansionDepth?: number;
    onTagSettingsChange?: () => void;
    showPersonNodes?: boolean;
    personAnchors?: any[];
    disabledPersons?: Set<string>;
    onPersonToggle?: (pubkey: string) => void;
    onPersonSettingsChange?: () => void;
    showSignedBy?: boolean;
    showReferenced?: boolean;
    totalPersonCount?: number;
    displayedPersonCount?: number;
  }>();

  let expanded = $state(true);
  let nodeTypesExpanded = $state(true);
  let tagAnchorsExpanded = $state(true);
  let tagControlsExpanded = $state(true);
  let personVisualizerExpanded = $state(true);

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

      <!-- Tag Anchor Controls Section -->
      <div class="legend-section">
        <div class="legend-section-header" onclick={() => tagControlsExpanded = !tagControlsExpanded}>
          <h4 class="legend-section-title">Tag Anchor Controls</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if tagControlsExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        
        {#if tagControlsExpanded}
          <div class="space-y-3">
            <!-- Show Tag Anchors Toggle -->
            <div class="flex items-center space-x-2">
              <button
                onclick={() => {
                  showTagAnchors = !showTagAnchors;
                  onTagSettingsChange();
                }}
                class="toggle-button {showTagAnchors ? 'active' : ''}"
              >
                {showTagAnchors ? 'ON' : 'OFF'}
              </button>
              <span class="text-sm">Show Tag Anchors</span>
            </div>
            
            {#if showTagAnchors}
              <!-- Tag Type Selection -->
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400">Tag Type:</label>
                <select
                  bind:value={selectedTagType}
                  onchange={onTagSettingsChange}
                  class="w-full text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white mt-1"
                >
                  <option value="t">Hashtags</option>
                  <option value="author">Authors</option>
                  <option value="e">Event References</option>
                  <option value="title">Titles</option>
                  <option value="summary">Summaries</option>
                </select>
                
              </div>
              
              <!-- Expansion Depth -->
              <div>
                <div class="flex items-center gap-2">
                  <label class="text-xs text-gray-600 dark:text-gray-400">Expansion Depth:</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    bind:value={tagExpansionDepth}
                    onchange={onTagSettingsChange}
                    class="w-16 text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
                  />
                  <span class="text-xs text-gray-500 dark:text-gray-400">(0-10)</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Fetch publications sharing tags
                </p>
              </div>
            {/if}
          </div>
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
              class="tag-grid {tagAnchors.length > 20 ? 'scrollable' : ''}"
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
      
      <!-- Person Visualizer Section -->
      <div class="legend-section">
        <div class="legend-section-header" onclick={() => personVisualizerExpanded = !personVisualizerExpanded}>
          <h4 class="legend-section-title">Person Visualizer</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if personVisualizerExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        
        {#if personVisualizerExpanded}
          <div class="space-y-3">
            <!-- Show Person Nodes Toggle -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <button
                  onclick={() => {
                    showPersonNodes = !showPersonNodes;
                    onPersonSettingsChange();
                  }}
                  class="toggle-button {showPersonNodes ? 'active' : ''}"
                >
                  {showPersonNodes ? 'ON' : 'OFF'}
                </button>
                <span class="text-sm">Show Person Nodes</span>
              </div>
              
              {#if showPersonNodes}
                <div class="flex items-center space-x-3 text-xs">
                  <label class="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      bind:checked={showSignedBy}
                      onchange={onPersonSettingsChange}
                      class="w-3 h-3"
                    />
                    <span>Signed by</span>
                  </label>
                  <label class="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      bind:checked={showReferenced}
                      onchange={onPersonSettingsChange}
                      class="w-3 h-3"
                    />
                    <span>Referenced</span>
                  </label>
                </div>
              {/if}
            </div>
            
            {#if showPersonNodes && personAnchors.length > 0}
              <p class="text-xs text-gray-600 dark:text-gray-400">
                {#if totalPersonCount > displayedPersonCount}
                  Displaying {displayedPersonCount} of {totalPersonCount} people found. Click to toggle visibility:
                {:else}
                  {personAnchors.length} people found. Click to toggle visibility:
                {/if}
              </p>
              <div
                class="tag-grid {personAnchors.length > 20 ? 'scrollable' : ''}"
                style="grid-template-columns: repeat(2, 1fr);"
              >
                {#each personAnchors as person}
                  {@const isDisabled = disabledPersons.has(person.pubkey)}
                  <button
                    class="tag-grid-item {isDisabled ? 'disabled' : ''}"
                    onclick={() => {
                      if (showPersonNodes) {
                        onPersonToggle(person.pubkey);
                      }
                    }}
                    disabled={!showPersonNodes}
                    title={!showPersonNodes ? 'Enable "Show Person Nodes" first' : isDisabled ? `Click to show ${person.displayName || person.pubkey}` : `Click to hide ${person.displayName || person.pubkey}`}
                  >
                    <div class="legend-icon">
                      <span
                        class="legend-diamond"
                        style="background-color: {person.isFromFollowList ? getEventKindColor(3) : '#10B981'}; opacity: {isDisabled ? 0.3 : 1};"
                      />
                    </div>
                    <span class="legend-text text-xs" style="opacity: {isDisabled ? 0.5 : 1};">
                      {person.displayName || person.pubkey.slice(0, 8) + '...'}
                      {#if !isDisabled}
                        <span class="text-gray-500">
                          ({person.signedByCount || 0}s/{person.referencedCount || 0}r)
                        </span>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            {:else if showPersonNodes}
              <p class="text-xs text-gray-500 dark:text-gray-400">
                No people found in the current events.
              </p>
            {/if}
          </div>
        {/if}
      </div>
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
  
  .tag-grid {
    display: grid;
    gap: 0.25rem;
  }
  
  .tag-grid.scrollable {
    max-height: 400px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }
  
  .tag-grid.scrollable::-webkit-scrollbar {
    width: 6px;
  }
  
  .tag-grid.scrollable::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  
  .tag-grid.scrollable::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 3px;
  }
  
  .tag-grid.scrollable::-webkit-scrollbar-thumb:hover {
    background: #555;
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
  
  :global(.dark) .tag-grid.scrollable::-webkit-scrollbar-track {
    background: #374151;
  }
  
  :global(.dark) .tag-grid.scrollable::-webkit-scrollbar-thumb {
    background: #6b7280;
  }
  
  :global(.dark) .tag-grid.scrollable::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
  
  .toggle-button {
    padding: 0.25rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: #f3f4f6;
    color: #6b7280;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 3rem;
  }
  
  .toggle-button.small {
    padding: 0.125rem 0.375rem;
    font-size: 0.625rem;
    min-width: 2.5rem;
  }
  
  .toggle-button:hover {
    background-color: #e5e7eb;
  }
  
  .toggle-button.active {
    background-color: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
  
  .toggle-button.active:hover {
    background-color: #2563eb;
  }
  
  :global(.dark) .toggle-button {
    background-color: #374151;
    border-color: #4b5563;
    color: #9ca3af;
  }
  
  :global(.dark) .toggle-button:hover {
    background-color: #4b5563;
  }
  
  :global(.dark) .toggle-button.active {
    background-color: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }
  
  :global(.dark) .toggle-button.active:hover {
    background-color: #2563eb;
  }
  
  .legend-diamond {
    display: inline-block;
    width: 14px;
    height: 14px;
    transform: rotate(45deg);
    border: 2px solid white;
  }
</style>
