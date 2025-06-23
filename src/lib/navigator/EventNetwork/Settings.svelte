<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import EventTypeConfig from "$lib/components/EventTypeConfig.svelte";
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
    profileStats = { totalFetched: 0, displayLimit: 50 },
  } = $props<{
    count: number;
    totalCount: number;
    onupdate: () => void;
    onclear?: () => void;

    starVisualization?: boolean;
    onFetchMissing?: (ids: string[]) => void;
    eventCounts?: { [kind: number]: number };
    profileStats?: { totalFetched: number; displayLimit: number };
  }>();

  let expanded = $state(false);
  let eventTypesExpanded = $state(true);
  let visualSettingsExpanded = $state(true);

  function toggle() {
    expanded = !expanded;
  }
  
  function toggleEventTypes() {
    eventTypesExpanded = !eventTypesExpanded;
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
</script>

<div class="leather-legend sm:!right-1 sm:!left-auto">
  <div class="flex items-center justify-between space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md px-2 py-1 -mx-2 -my-1" onclick={toggle}>
    <h3 class="h-leather">Settings</h3>
    <div class="pointer-events-none">
      {#if expanded}
        <CaretUpOutline />
      {:else}
        <CaretDownOutline />
      {/if}
    </div>
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
          <div class="pointer-events-none">
            {#if eventTypesExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
        </div>
        {#if eventTypesExpanded}
          <EventTypeConfig onReload={onupdate} {eventCounts} {profileStats} />
        {/if}
      </div>



      <!-- Visual Settings Section -->
      <div class="settings-section">
        <div class="settings-section-header" onclick={toggleVisualSettings}>
          <h4 class="settings-section-title">Visual Settings</h4>
          <div class="pointer-events-none">
            {#if visualSettingsExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
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
