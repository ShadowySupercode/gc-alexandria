<!--
  Settings Component
-->
<script lang="ts">
    import {Button} from 'flowbite-svelte';
    import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
    import { fly } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import EventLimitControl from "$lib/components/EventLimitControl.svelte";
    import EventRenderLevelLimit from "$lib/components/EventRenderLevelLimit.svelte";
    import { networkFetchLimit } from "$lib/state";

    let { 
      count = 0,
      onupdate
    } = $props<{count: number, onupdate: () => void}>();

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

<div class="leather-legend sm:!right-1 sm:!left-auto"  >
  <div class="flex items-center justify-between space-x-3">
    <h3 class="h-leather">Settings</h3>
    <Button color='none' outline size='xs' onclick={toggle} class="rounded-full" >
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
      <EventLimitControl on:update={handleLimitUpdate} />
      <EventRenderLevelLimit on:update={handleLimitUpdate} />
    </div>
  {/if}
</div>
