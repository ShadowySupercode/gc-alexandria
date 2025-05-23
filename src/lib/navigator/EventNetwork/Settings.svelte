<!--
  Settings Component
-->
<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import EventLimitControl from "$lib/components/EventLimitControl.svelte";
  import EventRenderLevelLimit from "$lib/components/EventRenderLevelLimit.svelte";
  import { networkFetchLimit } from "$lib/state";
  import { Toggle, Select } from "flowbite-svelte";

  let {
    count = 0,
    onupdate,
    starVisualization = $bindable(true),
    showTagAnchors = $bindable(false),
    selectedTagType = $bindable("t"),
  } = $props<{
    count: number;
    onupdate: () => void;
    starVisualization?: boolean;
    showTagAnchors?: boolean;
    selectedTagType?: string;
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
        Showing {count} events from {$networkFetchLimit} headers
      </span>

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
          <div class="mt-2">
            <label
              for="tag-type-select"
              class="text-xs text-gray-600 dark:text-gray-400">Tag Type:</label
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
        {/if}
      </div>

      <EventLimitControl on:update={handleLimitUpdate} />
      <EventRenderLevelLimit on:update={handleLimitUpdate} />
    </div>
  {/if}
</div>
