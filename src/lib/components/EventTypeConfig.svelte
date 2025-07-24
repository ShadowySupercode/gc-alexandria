<script lang="ts">
  import { visualizationConfig } from '$lib/stores/visualizationConfig';
  import { Button, Input } from 'flowbite-svelte';
  import { CloseCircleOutline } from 'flowbite-svelte-icons';
  import { getEventKindName, getEventKindColor } from '$lib/utils/eventColors';
  import { 
    validateEventKind, 
    handleAddEventKind, 
    handleEventKindKeydown 
  } from '$lib/utils/event_kind_utils';
  import type { EventCounts } from "$lib/types";
  
  let {
    onReload = () => {},
    eventCounts = {},
    profileStats = { totalFetched: 0, displayLimit: 50 }
  } = $props<{
    onReload?: () => void;
    eventCounts?: EventCounts;
    profileStats?: { totalFetched: number; displayLimit: number };
  }>();
  
  let newKind = $state('');
  let showAddInput = $state(false);
  let inputError = $state('');
  
  // Get existing kinds for validation
  let existingKinds = $derived($visualizationConfig.eventConfigs.map((ec: any) => ec.kind));
  
  function handleAddKind() {
    const result = handleAddEventKind(
      newKind,
      existingKinds,
      (kind) => visualizationConfig.addEventKind(kind),
      () => {
        newKind = '';
        showAddInput = false;
        inputError = '';
      }
    );
    
    if (!result.success) {
      inputError = result.error;
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    handleEventKindKeydown(
      e,
      handleAddKind,
      () => {
        showAddInput = false;
        newKind = '';
        inputError = '';
      }
    );
  }
  
  function handleLimitChange(kind: number, value: string) {
    const limit = parseInt(value);
    if (!isNaN(limit) && limit > 0) {
      visualizationConfig.updateEventLimit(kind, limit);
      // Update profile stats display limit if it's kind 0
      if (kind === 0) {
        profileStats = { ...profileStats, displayLimit: limit };
      }
    }
  }
  
  function handleNestedLevelsChange(value: string) {
    const levels = parseInt(value);
    if (!isNaN(levels) && levels >= 0) {
      visualizationConfig.updateNestedLevels(levels);
    }
  }
  
  function handleFollowDepthChange(value: string) {
    const depth = parseInt(value);
    if (!isNaN(depth) && depth >= 0 && depth <= 2) {
      visualizationConfig.updateFollowDepth(depth);
    }
  }
</script>

<div class="space-y-3">
  <span class="text-xs text-gray-600 dark:text-gray-400">
    Showing {Object.values(eventCounts).reduce((a: any, b: any) => a + b, 0)} of {Object.values(eventCounts).reduce((a: any, b: any) => a + b, 0)} events
  </span>
  
  <!-- Event configurations -->
  <div class="space-y-2">
    {#each $visualizationConfig.eventConfigs as config}
      {@const isLoaded = (eventCounts[config.kind] || 0) > 0}
      {@const isDisabled = config.enabled === false}
      {@const color = getEventKindColor(config.kind)}
      {@const borderColor = isLoaded ? 'border-green-500' : 'border-red-500'}
      <div class="flex items-center gap-2">
        <!-- Kind badge with color indicator and load status border -->
        <button
          class="flex items-center gap-1 min-w-[140px] px-2 py-1 border-2 rounded {borderColor} {isDisabled ? 'opacity-50' : ''} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          onclick={() => visualizationConfig.toggleKind(config.kind)}
          title={isDisabled ? `Click to enable ${getEventKindName(config.kind)}` : `Click to disable ${getEventKindName(config.kind)}`}
        >
          <span 
            class="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style="background-color: {color}"
          ></span>
          <span class="text-sm font-medium dark:text-white">
            {config.kind}
          </span>
        </button>
        <button
          onclick={() => visualizationConfig.removeEventKind(config.kind)}
          class="text-red-500 hover:text-red-700 transition-colors"
          title="Remove {getEventKindName(config.kind)}"
        >
          <CloseCircleOutline class="w-4 h-4" />
        </button>
        
        <!-- Special format for kind 0 (profiles) -->
        {#if config.kind === 0}
          <input
            type="number"
            value={config.limit}
            min="1"
            max={profileStats.totalFetched || 1000}
            class="w-16 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            oninput={(e) => handleLimitChange(config.kind, e.currentTarget.value)}
            title="Max profiles to display"
          />
          <span class="text-xs text-gray-600 dark:text-gray-400">
            of {profileStats.totalFetched} fetched
          </span>
        {:else}
          <!-- Limit input for other kinds -->
          <input
            type="number"
            value={config.limit}
            min="1"
            max="1000"
            class="w-16 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white {(config.kind === 30041 || config.kind === 30818) && config.showAll ? 'opacity-50' : ''}"
            oninput={(e) => handleLimitChange(config.kind, e.currentTarget.value)}
            title="Max to display"
            disabled={(config.kind === 30041 || config.kind === 30818) && config.showAll}
          />
          
          <!-- Show All checkbox for content kinds (30041, 30818) -->
          {#if config.kind === 30041 || config.kind === 30818}
            <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={config.showAll || false}
                onchange={() => visualizationConfig.toggleShowAllContent(config.kind)}
                class="w-3 h-3"
              />
              All
            </label>
          {/if}
        {/if}
        
        <!-- Nested levels for 30040 -->
        {#if config.kind === 30040}
          <span class="text-xs text-gray-600 dark:text-gray-400">Nested Levels:</span>
          <input
            type="number"
            value={config.nestedLevels || 1}
            min="0"
            max="10"
            class="w-14 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            oninput={(e) => handleNestedLevelsChange(e.currentTarget.value)}
            title="Levels to traverse"
          />
        {/if}
        
        <!-- Additional settings for kind 3 (follow lists) -->
        {#if config.kind === 3}
          <select
            value={config.depth || 0}
            onchange={(e) => handleFollowDepthChange(e.currentTarget.value)}
            class="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            title="How many degrees of separation to traverse"
          >
            <option value="0">Direct</option>
            <option value="1">2 degrees</option>
            <option value="2">3 degrees</option>
          </select>
        {/if}
        
        <!-- Load indicator -->
        {#if config.kind !== 0 && isLoaded}
          <span class="text-xs text-green-600 dark:text-green-400">
            ({eventCounts[config.kind]})
          </span>
        {:else if config.kind !== 0}
          <span class="text-xs text-red-600 dark:text-red-400">
            (not loaded)
          </span>
        {/if}
      </div>
    {/each}
  </div>
  
  <!-- Add kind button/input -->
  {#if showAddInput}
    <div class="flex items-center gap-2">
      <input
        bind:value={newKind}
        type="number"
        placeholder="Enter event kind number (e.g. 1)"
        class="flex-1 px-3 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        onkeydown={handleKeydown}
        oninput={(e) => {
          const validation = validateEventKind(e.currentTarget.value, existingKinds);
          inputError = validation.error;
        }}
      />
      <Button size="xs" onclick={handleAddKind} disabled={newKind === '' || !!inputError}>
        Add
      </Button>
      <Button 
        size="xs" 
        color="light" 
        onclick={() => {
          showAddInput = false;
          newKind = '';
          inputError = '';
        }}
      >
        Cancel
      </Button>
    </div>
    {#if inputError}
      <p class="text-xs text-red-500 -mt-2">
        {inputError}
      </p>
    {/if}
  {:else}
    <Button 
      size="xs" 
      color="light" 
      onclick={() => showAddInput = true}
      class="gap-1"
    >
      <span>+</span>
      <span>Add Event Type</span>
    </Button>
  {/if}
  
  <!-- Reload button -->
  <Button 
    size="xs" 
    color="blue" 
    onclick={onReload}
    class="gap-1"
    title="Reload graph with current settings"
  >
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
    </svg>
    <span>Reload</span>
  </Button>
  
  <!-- Border legend -->
  <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1 mt-2">
    <p class="flex items-center gap-2">
      <span class="inline-block w-3 h-3 border-2 border-green-500 rounded"></span>
      <span>Green = Events loaded</span>
    </p>
    <p class="flex items-center gap-2">
      <span class="inline-block w-3 h-3 border-2 border-red-500 rounded"></span>
      <span>Red = Not loaded (click Reload)</span>
    </p>
  </div>
</div>