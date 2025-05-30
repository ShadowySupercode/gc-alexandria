<script lang="ts">
  import { Button, Label } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import EventLimitControl from "$lib/components/EventLimitControl.svelte";
  import EventRenderLevelLimit from "$lib/components/EventRenderLevelLimit.svelte";
  import { networkFetchLimit } from "$lib/state";
  import { displayLimits } from "$lib/stores/displayLimits";
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

  function toggle() {
    expanded = !expanded;
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

      <!-- Initial Load Settings Section -->
      <div class="border-t border-gray-300 dark:border-gray-700 pt-3">
        <h4 class="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Initial Load</h4>
        <EventLimitControl on:update={handleLimitUpdate} />
        <EventRenderLevelLimit on:update={handleLimitUpdate} />
      </div>

      <!-- Display Limits Section -->
      <div class="border-t border-gray-300 dark:border-gray-700 pt-3">
        <h4 class="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Display Limits</h4>
        
        <div class="space-y-3">
          <div>
            <Label for="max-30040" class="text-xs text-gray-600 dark:text-gray-400">
              Max Publication Indices (30040)
            </Label>
            <input
              type="number"
              id="max-30040"
              min="-1"
              value={$displayLimits.max30040}
              oninput={(e) => handleDisplayLimitInput(e, 'max30040')}
              placeholder="-1 for unlimited"
              class="w-full text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
            />
          </div>

          <div>
            <Label for="max-30041" class="text-xs text-gray-600 dark:text-gray-400">
              Max Content Events (30041)
            </Label>
            <input
              type="number"
              id="max-30041"
              min="-1"
              value={$displayLimits.max30041}
              oninput={(e) => handleDisplayLimitInput(e, 'max30041')}
              placeholder="-1 for unlimited"
              class="w-full text-xs bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
            />
          </div>

          <label class="flex items-center space-x-2">
            <Toggle 
              checked={$displayLimits.fetchIfNotFound} 
              on:click={toggleFetchIfNotFound}
              class="text-xs" 
            />
            <span class="text-xs text-gray-600 dark:text-gray-400">Fetch if not found</span>
          </label>
          <p class="text-xs text-gray-500 dark:text-gray-400 ml-6">
            Automatically fetch missing referenced events
          </p>
        </div>
      </div>

      <!-- Visual Settings Section -->
      <div class="border-t border-gray-300 dark:border-gray-700 pt-3">
        <h4 class="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Visual Settings</h4>
        
        <div class="space-y-2">
          <label
            class="leather bg-transparent legend-text flex items-center space-x-2"
          >
            <Toggle bind:checked={starVisualization} class="text-xs" />
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
          <Toggle bind:checked={showTagAnchors} class="text-xs" />
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
                  >Expansion Depth:</label
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
      </div>
    </div>
  {/if}
</div>
