<script lang="ts">
  import { Button, Label } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import EventTypeConfig from "$lib/components/EventTypeConfig.svelte";
  import { displayLimits } from "$lib/stores/displayLimits";
  import { visualizationConfig } from "$lib/stores/visualizationConfig";
  import { Toggle } from "flowbite-svelte";

  let {
    count = 0,
    totalCount = 0,
    onupdate,
    onclear = () => {},
    starVisualization = $bindable(true),
    onFetchMissing = () => {},
    eventCounts = {},
  } = $props<{
    count: number;
    totalCount: number;
    onupdate: () => void;
    onclear?: () => void;

    starVisualization?: boolean;
    onFetchMissing?: (ids: string[]) => void;
    eventCounts?: { [kind: number]: number };
  }>();

  let expanded = $state(false);
  let eventTypesExpanded = $state(true);
  let displayLimitsExpanded = $state(true);
  let graphTraversalExpanded = $state(true);
  let visualSettingsExpanded = $state(true);

  function toggle() {
    expanded = !expanded;
  }
  
  function toggleEventTypes() {
    eventTypesExpanded = !eventTypesExpanded;
  }
  
  function toggleDisplayLimits() {
    displayLimitsExpanded = !displayLimitsExpanded;
  }
  
  function toggleGraphTraversal() {
    graphTraversalExpanded = !graphTraversalExpanded;
  }
  
  function toggleVisualSettings() {
    visualSettingsExpanded = !visualSettingsExpanded;
  }
  /**
   * Handles updates to visualization settings
   */
  function handleLimitUpdate() {
    onupdate();
  }


  function handleDisplayLimitInput(event: Event, limitType: 'max30040' | 'max30041') {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    
    console.log('[Settings] Display limit input changed:', limitType, 'value:', value);
    
    if (value === '' || value === '-1') {
      displayLimits.update(limits => ({
        ...limits,
        [limitType]: -1
      }));
      console.log('[Settings] Set', limitType, 'to unlimited (-1)');
    } else {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue >= 1) {
        displayLimits.update(limits => ({
          ...limits,
          [limitType]: numValue
        }));
        console.log('[Settings] Set', limitType, 'to', numValue);
      }
    }
  }

  function toggleFetchIfNotFound() {
    displayLimits.update(limits => ({
      ...limits,
      fetchIfNotFound: !limits.fetchIfNotFound
    }));
  }
</script>

<div class="leather-legend sm:!right-1 sm:!left-auto">
  <div class="flex items-center justify-between space-x-3">
    <h3 class="h-leather">Settings</h3>
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
    <div class="space-y-4">
      <span class="leather bg-transparent legend-text">
        Showing {count} of {totalCount} events
      </span>
      
      <!-- Event Configuration Section (combines types and limits) -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleEventTypes}>
          <h4 class="settings-section-title">Event Configuration</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if eventTypesExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        {#if eventTypesExpanded}
          <EventTypeConfig onReload={onupdate} {eventCounts} />
        {/if}
      </div>

      <!-- Display Limits Section -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleDisplayLimits}>
          <h4 class="settings-section-title">Display Limits</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if displayLimitsExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        {#if displayLimitsExpanded}
        
        <div class="space-y-3">
          <div>
            <Label for="max-pub-indices" class="text-xs text-gray-600 dark:text-gray-400">
              Max Publication Indices (30040)
            </Label>
            <input
              type="number"
              id="max-pub-indices"
              min="-1"
              value={$visualizationConfig.maxPublicationIndices}
              oninput={(e) => {
                const value = parseInt(e.currentTarget.value) || -1;
                visualizationConfig.setMaxPublicationIndices(value);
              }}
              placeholder="-1 for unlimited"
              class="w-full text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
            />
          </div>

          <div>
            <Label for="max-per-index" class="text-xs text-gray-600 dark:text-gray-400">
              Max Events per Index
            </Label>
            <input
              type="number"
              id="max-per-index"
              min="-1"
              value={$visualizationConfig.maxEventsPerIndex}
              oninput={(e) => {
                const value = parseInt(e.currentTarget.value) || -1;
                visualizationConfig.setMaxEventsPerIndex(value);
              }}
              placeholder="-1 for unlimited"
              class="w-full text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
            />
          </div>

          <label class="flex items-center space-x-2">
            <Toggle 
              checked={$displayLimits.fetchIfNotFound} 
              onclick={toggleFetchIfNotFound}
              class="text-xs" 
            />
            <span class="text-xs text-gray-600 dark:text-gray-400">Fetch if not found <span class="text-orange-500 font-normal">(not tested)</span></span>
          </label>
          <p class="text-xs text-gray-500 dark:text-gray-400 ml-6">
            Automatically fetch missing referenced events
          </p>
        </div>
        {/if}
      </div>

      <!-- Graph Traversal Section -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleGraphTraversal}>
          <h4 class="settings-section-title">Graph Traversal <span class="text-orange-500 text-xs font-normal">(not tested)</span></h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if graphTraversalExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        {#if graphTraversalExpanded}
        
        <label class="flex items-center space-x-2">
          <Toggle 
            checked={$visualizationConfig.searchThroughFetched} 
            onclick={() => visualizationConfig.toggleSearchThroughFetched()}
            class="text-xs" 
          />
          <span class="text-xs text-gray-600 dark:text-gray-400">Search through already fetched</span>
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400 ml-6">
          When enabled, graph expansion will only use events already loaded
        </p>
        
        <label class="flex items-center space-x-2 mt-3">
          <Toggle 
            checked={$visualizationConfig.appendMode} 
            onclick={() => visualizationConfig.toggleAppendMode()}
            class="text-xs" 
          />
          <span class="text-xs text-gray-600 dark:text-gray-400">Append mode (accumulate events)</span>
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400 ml-6">
          When enabled, new fetches will add to existing graph instead of replacing it
        </p>
        
        {#if $visualizationConfig.appendMode && count > 0}
          <Button 
            size="xs" 
            color="red" 
            onclick={onclear}
            class="gap-1 mt-3"
            title="Clear all accumulated events"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            <span>Clear Graph ({count} events)</span>
          </Button>
        {/if}
        {/if}
      </div>

      <!-- Visual Settings Section -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleVisualSettings}>
          <h4 class="settings-section-title">Visual Settings</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if visualSettingsExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        {#if visualSettingsExpanded}
        
        <div class="space-y-2">
          <label
            class="leather bg-transparent legend-text flex items-center space-x-2"
          >
            <Toggle 
              checked={starVisualization} 
              onchange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                starVisualization = target.checked;
              }}
              class="text-xs" 
            />
            <span>Star Network View</span>
          </label>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Toggle between star clusters (on) and linear sequence (off)
            visualization
          </p>
        </div>

        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .settings-section {
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
  }

  .settings-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .settings-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 0.5rem 0;
    margin-bottom: 0.75rem;
  }

  .settings-section-header:hover {
    background-color: #f9fafb;
    border-radius: 0.375rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .settings-section-title {
    font-weight: 600;
    color: #374151;
    margin: 0;
    font-size: 0.875rem;
  }

  :global(.dark) .settings-section-header:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  :global(.dark) .settings-section-title {
    color: #d1d5db;
  }

  :global(.dark) .settings-section {
    border-bottom-color: #374151;
  }
</style>
