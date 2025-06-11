<script lang="ts">
  import { Button, Label } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import EventLimitControl from "$lib/components/EventLimitControl.svelte";
  import EventRenderLevelLimit from "$lib/components/EventRenderLevelLimit.svelte";
  import EventKindFilter from "$lib/components/EventKindFilter.svelte";
  import { networkFetchLimit, levelsToRender } from "$lib/state";
  import { displayLimits } from "$lib/stores/displayLimits";
  import { visualizationConfig } from "$lib/stores/visualizationConfig";
  import { Toggle, Select } from "flowbite-svelte";

  let {
    count = 0,
    totalCount = 0,
    onupdate,
    starVisualization = $bindable(true),
    showTagAnchors = $bindable(false),
    selectedTagType = $bindable("t"),
    tagExpansionDepth = $bindable(0),
    onFetchMissing = () => {},
  } = $props<{
    count: number;
    totalCount: number;
    onupdate: () => void;

    starVisualization?: boolean;
    showTagAnchors?: boolean;
    selectedTagType?: string;
    tagExpansionDepth?: number;
    onFetchMissing?: (ids: string[]) => void;
  }>();

  let expanded = $state(false);
  let eventTypesExpanded = $state(true);
  let initialLoadExpanded = $state(true);
  let displayLimitsExpanded = $state(true);
  let graphTraversalExpanded = $state(true);
  let visualSettingsExpanded = $state(true);

  function toggle() {
    expanded = !expanded;
  }
  
  function toggleEventTypes() {
    eventTypesExpanded = !eventTypesExpanded;
  }
  
  function toggleInitialLoad() {
    initialLoadExpanded = !initialLoadExpanded;
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

  function handleDepthInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value);
    // Ensure value is between 0 and 10
    if (!isNaN(value) && value >= 0 && value <= 10) {
      tagExpansionDepth = value;
    } else if (input.value === "") {
      tagExpansionDepth = 0;
    }
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
      
      <!-- Event Kind Filter Section -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleEventTypes}>
          <h4 class="settings-section-title">Event Types <span class="text-orange-500 text-xs font-normal">(not tested)</span></h4>
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
          <EventKindFilter />
        {/if}
      </div>

      <!-- Initial Load Settings Section -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleInitialLoad}>
          <h4 class="settings-section-title">Initial Load</h4>
          <Button
            color="none"
            outline
            size="xs"
            class="rounded-full p-1"
          >
            {#if initialLoadExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </Button>
        </div>
        {#if initialLoadExpanded}
          <div>
            <EventLimitControl on:update={handleLimitUpdate} />
            <EventRenderLevelLimit on:update={handleLimitUpdate} />
          </div>
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

      <div class="space-y-2">
        <label
          class="leather bg-transparent legend-text flex items-center space-x-2"
        >
          <Toggle 
            checked={showTagAnchors} 
            onchange={(e: Event) => {
              const target = e.target as HTMLInputElement;
              showTagAnchors = target.checked;
            }}
            class="text-xs"
          />
          <span>Show Tag Anchors</span>
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Display tag anchors that attract nodes with matching tags
        </p>

        {#if showTagAnchors}
          <div class="mt-2 space-y-3">
            <div>
              <label
                for="tag-type-select"
                class="text-xs text-gray-600 dark:text-gray-400"
                >Tag Type:</label
              >
              <Select
                id="tag-type-select"
                bind:value={selectedTagType}
                size="sm"
                class="text-xs mt-1"
              >
                <option value="t">Hashtags</option>
                <option value="author">Authors</option>
                <option value="p">People (Pubkeys)</option>
                <option value="e">Event References</option>
                <!-- <option value="a">Article References</option> -->
                <option value="title">Titles</option>
                <option value="summary">Summaries</option>
              </Select>
            </div>

            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <label
                  for="tag-depth-input"
                  class="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap"
                  >Expansion Depth: <span class="text-red-500 font-semibold">(not functional)</span></label
                >
                <input
                  type="number"
                  id="tag-depth-input"
                  min="0"
                  max="10"
                  value={tagExpansionDepth}
                  oninput={handleDepthInput}
                  class="w-16 text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
                />
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  (0-10)
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Fetch publications sharing tags
              </p>
            </div>
          </div>
        {/if}
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
