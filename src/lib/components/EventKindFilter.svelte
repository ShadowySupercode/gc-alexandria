<script lang="ts">
  import { visualizationConfig } from '$lib/stores/visualizationConfig';
  import { Button, Badge } from 'flowbite-svelte';
  import { CloseCircleOutline } from 'flowbite-svelte-icons';
  
  let {
    onReload = () => {}
  } = $props<{
    onReload?: () => void;
  }>();
  
  let newKind = $state('');
  let showAddInput = $state(false);
  let inputError = $state('');
  
  function validateKind(value: string): number | null {
    const kind = parseInt(value.trim());
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
    const kind = validateKind(newKind);
    if (kind !== null) {
      visualizationConfig.addKind(kind);
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
      <button
        class="badge-container {isDisabled ? 'disabled' : ''}"
        onclick={() => toggleKind(kind)}
        title={isDisabled ? `Click to enable ${getKindName(kind)}` : `Click to disable ${getKindName(kind)}`}
      >
        <Badge 
          color="dark" 
          class="flex items-center gap-1 px-2 py-1 {isDisabled ? 'opacity-40' : ''}"
        >
          <span class="text-xs">{kind}</span>
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
    
    {#if showAddInput}
      <div class="flex items-center gap-1">
        <div class="relative">
          <input
            bind:value={newKind}
            type="number"
            placeholder="Kind"
            class="w-20 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
            onkeydown={handleKeydown}
            oninput={() => validateKind(newKind)}
          />
          {#if inputError}
            <div class="absolute top-full left-0 mt-1 text-xs text-red-500 whitespace-nowrap">
              {inputError}
            </div>
          {/if}
        </div>
        <Button size="xs" onclick={handleAddKind} disabled={!!inputError}>
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
          ×
        </Button>
      </div>
    {:else}
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