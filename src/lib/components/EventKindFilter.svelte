<script lang="ts">
  import { visualizationConfig } from '$lib/stores/visualizationConfig';
  import { Button, Badge } from 'flowbite-svelte';
  import { CloseCircleOutline } from 'flowbite-svelte-icons';
  
  let {
    onReload = () => {},
    eventCounts = {}
  } = $props<{
    onReload?: () => void;
    eventCounts?: { [kind: number]: number };
  }>();
  
  let newKind = $state('');
  let showAddInput = $state(false);
  let inputError = $state('');
  
  function validateKind(value: string | number): number | null {
    // Convert to string for consistent handling
    const strValue = String(value);
    if (!strValue || strValue.trim() === '') {
      inputError = '';
      return null;
    }
    const kind = parseInt(strValue.trim());
    if (isNaN(kind)) {
      inputError = 'Must be a number';
      return null;
    }
    if (kind < 0) {
      inputError = 'Must be positive';
      return null;
    }
    if ($visualizationConfig.allowedKinds.includes(kind)) {
      inputError = 'Already added';
      return null;
    }
    inputError = '';
    return kind;
  }
  
  function handleAddKind() {
    console.log('[EventKindFilter] handleAddKind called with:', newKind);
    const kind = validateKind(newKind);
    console.log('[EventKindFilter] Validation result:', kind);
    if (kind !== null) {
      console.log('[EventKindFilter] Before adding, allowedKinds:', $visualizationConfig.allowedKinds);
      visualizationConfig.addKind(kind);
      // Force a small delay to ensure store update propagates
      setTimeout(() => {
        console.log('[EventKindFilter] After adding, allowedKinds:', $visualizationConfig.allowedKinds);
      }, 10);
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
    visualizationConfig.removeKind(kind);
  }
  
  function toggleKind(kind: number) {
    visualizationConfig.toggleKind(kind);
  }
  
  // Get kind name for display
  function getKindName(kind: number): string {
    switch (kind) {
      case 30040: return 'Publication Index';
      case 30041: return 'Publication Content';
      case 30818: return 'Wiki';
      case 1: return 'Text Note';
      case 0: return 'Metadata';
      default: return `Kind ${kind}`;
    }
  }
</script>

<div class="space-y-3">
  <div class="flex flex-wrap gap-2 items-center">
    {#each $visualizationConfig.allowedKinds as kind}
      {@const isDisabled = $visualizationConfig.disabledKinds.includes(kind)}
      {@const isLoaded = (eventCounts[kind] || 0) > 0}
      {@const borderColor = isLoaded ? 'border-green-500' : 'border-red-500'}
      <button
        class="badge-container {isDisabled ? 'disabled' : ''} {isLoaded ? 'loaded' : 'not-loaded'}"
        onclick={() => toggleKind(kind)}
        title={isDisabled ? `Click to enable ${getKindName(kind)}` : `Click to disable ${getKindName(kind)}`}
      >
        <Badge 
          color="dark" 
          class="flex items-center gap-1 px-2 py-1 {isDisabled ? 'opacity-40' : ''} border-2 {borderColor}"
        >
          <span class="text-xs">{kind}</span>
          {#if isLoaded}
            <span class="text-xs text-gray-400">({eventCounts[kind]})</span>
          {/if}
          <button
            onclick={(e) => {
              e.stopPropagation();
              removeKind(kind);
            }}
            class="ml-1 text-red-500 hover:text-red-700 transition-colors"
            title="Remove {getKindName(kind)}"
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
  
  <label class="flex items-center gap-2 text-xs">
    <input
      type="checkbox"
      checked={$visualizationConfig.allowFreeEvents}
      onchange={() => visualizationConfig.toggleFreeEvents()}
      class="rounded dark:bg-gray-700 dark:border-gray-600"
    />
    <span>Allow free events <span class="text-orange-500 font-normal">(not tested)</span></span>
    <span class="text-gray-500 dark:text-gray-400">(not connected to 30040)</span>
  </label>
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