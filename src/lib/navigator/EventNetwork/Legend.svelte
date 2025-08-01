<script lang="ts">
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { getEventKindColor, getEventKindName } from '$lib/utils/eventColors';
  import type { EventCounts } from "$lib/types";

  const TAG_LEGEND_COLUMNS = 3; // Number of columns for tag anchor table
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
    eventCounts?: EventCounts;
    disabledTags?: Set<string>;
    onTagToggle?: (tagId: string) => void;
    autoDisabledTags?: boolean;
    showTagAnchors?: boolean;
    selectedTagType?: string;
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
  let tagSortMode = $state<'count' | 'alphabetical'>('count');

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

  function invertTagSelection() {
    // Invert selection - toggle all tags one by one
    const allTagIds = tagAnchors.map((anchor: any) => `${anchor.type}-${anchor.label}`);
    
    // Process all tags
    allTagIds.forEach((tagId: string) => {
      onTagToggle(tagId);
    });
  }

  function invertPersonSelection() {
    // Invert selection - toggle all person nodes
    const allPubkeys = personAnchors.map((person: any) => person.pubkey);
    
    // Process all persons
    allPubkeys.forEach((pubkey: string) => {
      onPersonToggle(pubkey);
    });
  }
</script>

<div class={`leather-legend ${className}`}>
  <button 
    class="flex items-center justify-between space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md px-2 py-1 -mx-2 -my-1 w-full text-left border-none bg-none"
    onclick={toggle}
    onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggle() : null}
    aria-expanded={expanded}
    aria-controls="legend-content"
  >
    <h3 class="h-leather">Legend</h3>
    <div class="pointer-events-none">
      {#if expanded}
        <CaretUpOutline />
      {:else}
        <CaretDownOutline />
      {/if}
    </div>
  </button>

  {#if expanded}
    <div id="legend-content" class="space-y-4">
      <!-- Node Types Section -->
      <div class="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 last:border-b-0 last:mb-0">
        <button 
          class="flex justify-between items-center cursor-pointer px-2 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 mb-3 w-full text-left border-none bg-none"
          onclick={toggleNodeTypes}
          onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleNodeTypes() : null}
          aria-expanded={nodeTypesExpanded}
          aria-controls="node-types-content"
        >
          <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm m-0">Node Types</h4>
          <div class="pointer-events-none">
            {#if nodeTypesExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
        </button>
        
        {#if nodeTypesExpanded}
          <div id="node-types-content">
            <ul class="space-y-2">
              <!-- Dynamic event kinds -->
              {#each Object.entries(eventCounts).sort(([a], [b]) => Number(a) - Number(b)) as [kindStr, count]}
                {@const kind = Number(kindStr)}
                {@const countNum = count as number}
                {@const color = getEventKindColor(kind)}
                {@const name = getEventKindName(kind)}
                {#if countNum > 0}
                  <li class="flex items-center mb-2 last:mb-0">
                    <div class="flex items-center mr-2">
                      <span
                        class="w-4 h-4 rounded-full"
                        style="background-color: {color}"
                      >
                      </span>
                    </div>
                    <span class="text-sm text-gray-700 dark:text-gray-300">
                      {kind} - {name} ({countNum})
                    </span>
                  </li>
                {/if}
              {/each}

              <!-- Connection lines -->
              <li class="flex items-center mb-2 last:mb-0">
                <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
                  <path
                    d="M4 12h16M16 6l6 6-6 6"
                    class="network-link-leather"
                    stroke-width="2"
                    fill="none"
                  />
                </svg>
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  {#if starMode}
                    Radial connections from centers to related events
                  {:else}
                    Arrows indicate relationships and sequence
                  {/if}
                </span>
              </li>
              
              <!-- Edge colors for person connections -->
              {#if showPersonNodes && personAnchors.length > 0}
                <li class="flex items-center mb-2 last:mb-0">
                  <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
                    <path
                      d="M4 12h16"
                      class="person-link-signed"
                      stroke-width="2"
                      fill="none"
                    />
                  </svg>
                  <span class="text-xs text-gray-700 dark:text-gray-300">
                    Authored by person
                  </span>
                </li>
                <li class="flex items-center mb-2 last:mb-0">
                  <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
                    <path
                      d="M4 12h16"
                      class="person-link-referenced"
                      stroke-width="2"
                      fill="none"
                    />
                  </svg>
                  <span class="text-xs text-gray-700 dark:text-gray-300">
                    References person
                  </span>
                </li>
              {/if}
            </ul>
          </div>
        {/if}
      </div>

      <!-- Tag Anchor Controls Section -->
      <div class="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 last:border-b-0 last:mb-0">
        <button 
          class="flex justify-between items-center cursor-pointer px-2 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 mb-3 w-full text-left border-none bg-none"
          onclick={() => tagControlsExpanded = !tagControlsExpanded}
          onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? (tagControlsExpanded = !tagControlsExpanded) : null}
          aria-expanded={tagControlsExpanded}
          aria-controls="tag-controls-content"
        >
          <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm m-0">Tag Anchor Controls</h4>
          <div class="pointer-events-none">
            {#if tagControlsExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
        </button>
        
        {#if tagControlsExpanded}
          <div id="tag-controls-content" class="space-y-3">
            <!-- Show Tag Anchors Toggle -->
            <div class="flex items-center space-x-2">
              <button
                onclick={() => {
                  showTagAnchors = !showTagAnchors;
                  onTagSettingsChange();
                }}
                onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? (showTagAnchors = !showTagAnchors, onTagSettingsChange()) : null}
                class="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs font-medium cursor-pointer transition min-w-[3rem] hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 {showTagAnchors ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:border-blue-600 dark:hover:bg-blue-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
                aria-pressed={showTagAnchors}
              >
                {showTagAnchors ? 'ON' : 'OFF'}
              </button>
              <span class="text-sm">Show Tag Anchors</span>
            </div>
            
            {#if showTagAnchors}
              <!-- Tag Type Selection -->
              <div>
                <label for="tag-type-select" class="text-xs text-gray-600 dark:text-gray-400">Tag Type:</label>
                <select
                  id="tag-type-select"
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
            {/if}
          </div>
        {/if}
      </div>

      <!-- Tag Anchors section -->
      {#if showTags && tagAnchors.length > 0}
        <div class="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 last:border-b-0 last:mb-0">
          <button 
            class="flex justify-between items-center cursor-pointer px-2 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 mb-3 w-full text-left border-none bg-none"
            onclick={toggleTagAnchors}
            onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleTagAnchors() : null}
            aria-expanded={tagAnchorsExpanded}
            aria-controls="tag-anchors-content"
          >
            <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm m-0">Active Tag Anchors: {tagAnchors[0].type}</h4>
            <div class="pointer-events-none">
              {#if tagAnchorsExpanded}
                <CaretUpOutline class="w-3 h-3" />
              {:else}
                <CaretDownOutline class="w-3 h-3" />
              {/if}
            </div>
          </button>
          
          {#if tagAnchorsExpanded}
            {@const sortedAnchors = tagSortMode === 'count' 
              ? [...tagAnchors].sort((a, b) => b.count - a.count)
              : [...tagAnchors].sort((a, b) => a.label.localeCompare(b.label))
            }
            <div id="tag-anchors-content">
              {#if autoDisabledTags}
                <div class="text-xs text-amber-600 dark:text-amber-400 mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                  <strong>Note:</strong> All {tagAnchors.length} tags were auto-disabled to prevent graph overload. Click individual tags below to enable them.
                </div>
              {/if}
              
              <!-- Sort options and controls -->
              <div class="flex items-center justify-between gap-4 mb-3">
                <div class="flex items-center gap-4">
                  <span class="text-xs text-gray-600 dark:text-gray-400">Sort by:</span>
                  <label class="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="tagSort"
                      value="count"
                      bind:group={tagSortMode}
                      class="w-3 h-3"
                    />
                    <span class="text-xs">Count</span>
                  </label>
                  <label class="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="tagSort"
                      value="alphabetical"
                      bind:group={tagSortMode}
                      class="w-3 h-3"
                    />
                    <span class="text-xs">Alphabetical</span>
                  </label>
                </div>
              </div>
              
              <div class="space-y-1 max-h-48 overflow-y-auto">
                {#each sortedAnchors as tag}
                  {@const isDisabled = disabledTags.has(tag.value)}
                  <button
                    class="flex items-center justify-between w-full p-2 rounded text-left border-none bg-none cursor-pointer transition hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                    onclick={() => onTagToggle(tag.value)}
                    onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? onTagToggle(tag.value) : null}
                    disabled={false}
                    title={isDisabled ? `Click to show ${tag.label}` : `Click to hide ${tag.label}`}
                    aria-pressed={!isDisabled}
                  >
                    <span class="text-xs text-gray-700 dark:text-gray-300" style="opacity: {isDisabled ? 0.5 : 1};">
                      {tag.label} ({tag.count})
                    </span>
                    <div class="flex items-center">
                      <span
                        class="inline-block w-3.5 h-3.5 rotate-45 border-2 border-white"
                        style="background-color: {getEventKindColor(30040)}; opacity: {isDisabled ? 0.3 : 1};"
                      ></span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Person Visualizer Section -->
      <div class="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 last:border-b-0 last:mb-0">
        <button 
          class="flex justify-between items-center cursor-pointer px-2 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 mb-3 w-full text-left border-none bg-none"
          onclick={() => personVisualizerExpanded = !personVisualizerExpanded}
          onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? (personVisualizerExpanded = !personVisualizerExpanded) : null}
          aria-expanded={personVisualizerExpanded}
          aria-controls="person-visualizer-content"
        >
          <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm m-0">Person Visualizer</h4>
          <div class="pointer-events-none">
            {#if personVisualizerExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
        </button>
        
        {#if personVisualizerExpanded}
          <div id="person-visualizer-content" class="space-y-3">
            <!-- Show Person Nodes Toggle -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <button
                  onclick={() => {
                    showPersonNodes = !showPersonNodes;
                    onPersonSettingsChange();
                  }}
                  onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? (showPersonNodes = !showPersonNodes, onPersonSettingsChange()) : null}
                  class="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs font-medium cursor-pointer transition min-w-[3rem] hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 {showPersonNodes ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:border-blue-600 dark:hover:bg-blue-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
                  aria-pressed={showPersonNodes}
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
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs text-gray-600 dark:text-gray-400">
                  {#if totalPersonCount > displayedPersonCount}
                    Displaying {displayedPersonCount} of {totalPersonCount} people found:
                  {:else}
                    {personAnchors.length} people found:
                  {/if}
                </p>
                
                <label class="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    onclick={invertPersonSelection}
                    class="w-3 h-3"
                  />
                  <span class="text-xs">Invert Selection</span>
                </label>
              </div>
              
              <div
                class="grid gap-1 {personAnchors.length > 20 ? 'max-h-96 overflow-y-auto pr-2' : ''}"
                style="grid-template-columns: repeat(2, 1fr);"
              >
                {#each personAnchors as person}
                  {@const isDisabled = disabledPersons.has(person.pubkey)}
                  <button
                    class="flex items-center gap-1 p-1 rounded w-full text-left border-none bg-none cursor-pointer transition hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                    onclick={() => {
                      if (showPersonNodes) {
                        onPersonToggle(person.pubkey);
                      }
                    }}
                    onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? (showPersonNodes && onPersonToggle(person.pubkey)) : null}
                    disabled={!showPersonNodes}
                    title={!showPersonNodes ? 'Enable "Show Person Nodes" first' : isDisabled ? `Click to show ${person.displayName || person.pubkey}` : `Click to hide ${person.displayName || person.pubkey}`}
                    aria-pressed={!isDisabled}
                  >
                    <div class="flex items-center">
                      <span
                        class="inline-block w-3.5 h-3.5 rotate-45 border-2 border-white"
                        style="background-color: {person.isFromFollowList ? getEventKindColor(3) : '#10B981'}; opacity: {isDisabled ? 0.3 : 1};"
                      ></span>
                    </div>
                    <span class="text-xs text-gray-700 dark:text-gray-300" style="opacity: {isDisabled ? 0.5 : 1};">
                      {person.displayName || person.pubkey.substring(0, 8)}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
