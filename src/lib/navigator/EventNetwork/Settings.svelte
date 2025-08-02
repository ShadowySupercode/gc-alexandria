<script lang="ts">
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import EventTypeConfig from "$lib/components/EventTypeConfig.svelte";
  import { visualizationConfig } from "$lib/stores/visualizationConfig";
  import { Toggle } from "flowbite-svelte";
  import type { EventCounts } from "$lib/types";

  let {
    count = 0,
    totalCount = 0,
    onupdate,
    onclear = () => {},
    starVisualization = $bindable(true),
    eventCounts = {},
    profileStats = { totalFetched: 0, displayLimit: 50 },
  } = $props<{
    count: number;
    totalCount: number;
    onupdate: () => void;
    onclear?: () => void;

    starVisualization?: boolean;
    eventCounts?: EventCounts;
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
</script>

<div class="leather-legend sm:!right-1 sm:!left-auto">
  <button 
    class="flex items-center justify-between space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md px-2 py-1 -mx-2 -my-1 w-full text-left border-none bg-none"
    onclick={toggle}
    onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggle() : null}
    aria-expanded={expanded}
    aria-controls="settings-content"
  >
    <h3 class="h-leather">Settings</h3>
    <div class="pointer-events-none">
      {#if expanded}
        <CaretUpOutline />
      {:else}
        <CaretDownOutline />
      {/if}
    </div>
  </button>

  {#if expanded}
    <div id="settings-content" class="space-y-4">
      <span class="leather bg-transparent legend-text">
        Showing {count} of {totalCount} events
      </span>
      
      <!-- Event Configuration Section (combines types and limits) -->
      <div
        class="settings-section border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 last:border-b-0 last:mb-0"
      >
        <button
          class="settings-section-header flex justify-between items-center cursor-pointer py-2 mb-3 hover:bg-gray-50 dark:hover:bg-white/5 hover:rounded-md hover:px-2 w-full text-left border-none bg-none"
          onclick={toggleEventTypes}
          onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleEventTypes() : null}
          aria-expanded={eventTypesExpanded}
          aria-controls="event-types-content"
        >
          <h4 class="settings-section-title font-semibold text-gray-700 dark:text-gray-300 m-0 text-sm">
            Event Configuration
          </h4>
          <div class="pointer-events-none">
            {#if eventTypesExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
        </button>
        {#if eventTypesExpanded}
          <div id="event-types-content">
            <EventTypeConfig onReload={onupdate} {eventCounts} {profileStats} />
          </div>
        {/if}
      </div>

      <!-- Visual Settings Section -->
      <div
        class="settings-section border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 last:border-b-0 last:mb-0"
      >
        <button
          class="settings-section-header flex justify-between items-center cursor-pointer py-2 mb-3 hover:bg-gray-50 dark:hover:bg-white/5 hover:rounded-md hover:px-2 w-full text-left border-none bg-none"
          onclick={toggleVisualSettings}
          onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleVisualSettings() : null}
          aria-expanded={visualSettingsExpanded}
          aria-controls="visual-settings-content"
        >
          <h4 class="settings-section-title font-semibold text-gray-700 dark:text-gray-300 m-0 text-sm">
            Visual Settings
          </h4>
          <div class="pointer-events-none">
            {#if visualSettingsExpanded}
              <CaretUpOutline class="w-3 h-3" />
            {:else}
              <CaretDownOutline class="w-3 h-3" />
            {/if}
          </div>
        </button>
        {#if visualSettingsExpanded}
          <div id="visual-settings-content">
            <div class="space-y-4">
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
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
