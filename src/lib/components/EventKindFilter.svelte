<script lang="ts">
  import { visualizationConfig, enabledEventKinds } from '$lib/stores/visualizationConfig';
  import { Button, Badge } from 'flowbite-svelte';
  import { CloseCircleOutline } from 'flowbite-svelte-icons';
  import type { EventCounts } from "$lib/types";
  import { NostrKind } from '$lib/types';
  
  let {
    onReload = () => {},
    eventCounts = {}
  } = $props<{
    onReload?: () => void;
    eventCounts?: EventCounts;
  }>();
  
  let newKind = $state('');
  let showAddInput = $state(false);
  let inputError = $state('');

  function validateKind(value: string): number | null {
    if (!value || value.trim() === '') {
      inputError = '';
      return null;
    }
    const kind = parseInt(value.trim());
    if (isNaN(kind)) {
      inputError = 'Must be a number';
      return null;
    }
    if (kind < 0) {
      inputError = 'Must be positive';
      return null;
    }
    if ($visualizationConfig.eventConfigs.some(ec => ec.kind === kind)) {
      inputError = 'Already added';
      return null;
    }
    inputError = '';
    return kind;
  }

  function handleAddKind() {
    const kind = validateKind(newKind);
    if (kind != null) {
      visualizationConfig.addEventKind(kind);
      newKind = '';
      showAddInput = false;
      inputError = '';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleAddKind();
    } else if (e.key === 'Escape') {
      showAddInput = false;
      newKind = '';
      inputError = '';
    }
  }

  function removeKind(kind: number) {
    visualizationConfig.removeEventKind(kind);
  }

  function toggleKind(kind: number) {
    visualizationConfig.toggleKind(kind);
  }

  function getKindName(kind: number): string {
    switch (kind) {
      case NostrKind.PublicationIndex: return 'Publication Index';
      case NostrKind.PublicationContent: return 'Publication Content';
      case NostrKind.Wiki: return 'Wiki';
      case NostrKind.TextNote: return 'Text Note';
      case NostrKind.UserMetadata: return 'Metadata';
      default: return `Kind ${kind}`;
    }
  }
</script>

<div class="space-y-3">
  <div class="flex flex-wrap gap-2 items-center">
    {#each $visualizationConfig.eventConfigs as ec}
      {@const isEnabled = ec.enabled !== false}
      {@const isLoaded = (eventCounts[ec.kind] || 0) > 0}
      {@const borderColor = isLoaded ? 'border-green-500' : 'border-red-500'}
      <button
        class="badge-container {isEnabled ? '' : 'disabled'} {isLoaded ? 'loaded' : 'not-loaded'}"
        onclick={() => toggleKind(ec.kind)}
        title={isEnabled ? `Click to disable ${getKindName(ec.kind)}` : `Click to enable ${getKindName(ec.kind)}`}
      >
        <Badge 
          color="dark" 
          class="flex items-center gap-1 px-2 py-1 {isEnabled ? '' : 'opacity-40'} border-2 {borderColor}"
        >
          <span class="text-xs">{ec.kind}</span>
          {#if isLoaded}
            <span class="text-xs text-gray-400">({eventCounts[ec.kind]})</span>
          {/if}
          <button
            onclick={(e) => {
              e.stopPropagation();
              removeKind(ec.kind);
            }}
            class="ml-1 text-red-500 hover:text-red-700 transition-colors"
            title="Remove {getKindName(ec.kind)}"
          >
            <CloseCircleOutline class="w-3 h-3" />
          </button>
        </Badge>
      </button>
    {/each}
    
    {#if !showAddInput}
      <Button 
        size="xs" 
        color="light" 
        onclick={() => showAddInput = true}
        class="gap-1"
      >
        <span>+</span>
        <span>Add Kind</span>
      </Button>
    {/if}
    
    <Button 
      size="xs" 
      color="blue" 
      onclick={onReload}
      class="gap-1"
      title="Reload graph with current event type filters"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      <span>Reload</span>
    </Button>
  </div>
  
  {#if showAddInput}
    <div class="flex items-center gap-2">
      <input
        bind:value={newKind}
        type="number"
        placeholder="Enter event kind number (e.g. 1)"
        class="flex-1 px-3 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        onkeydown={handleKeydown}
        oninput={(e) => {
          const value = (e.target as HTMLInputElement).value;
          validateKind(value);
        }}
      />
      <Button size="xs" onclick={handleAddKind} disabled={!newKind}>
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
  {/if}
  
  <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
    <p class="flex items-center gap-2">
      <span class="inline-block w-3 h-3 border-2 border-green-500 rounded"></span>
      <span>Green border = Events loaded</span>
    </p>
    <p class="flex items-center gap-2">
      <span class="inline-block w-3 h-3 border-2 border-red-500 rounded"></span>
      <span>Red border = Not loaded (click Reload to fetch)</span>
    </p>
  </div>
</div>

<style>
  .badge-container {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: transform 0.2s ease;
  }
  
  .badge-container:hover:not(.disabled) {
    transform: scale(1.05);
  }
  
  .badge-container.disabled {
    cursor: pointer;
  }
</style>