<script lang='ts'>
  import { goto } from '$app/navigation';
  import { Alert, P, Button } from 'flowbite-svelte';
  import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
  
  let { id, dTag, error } = $props<{ id?: string; dTag?: string; error?: string }>();
</script>

<main class="flex flex-col items-center justify-center min-h-screen p-4">
  <Alert class="max-w-xl">
    <div class="flex items-center space-x-2 mb-4">
      <ExclamationCircleOutline class="w-6 h-6" />
      <span class="text-lg font-medium">
        Publication Not Found
      </span>
    </div>
    <P size="sm" class="mb-4 break-words">
      {#if error}
        Error: {error}
      {:else}
        Unable to find publication {#if id}with ID: 
        <span class="break-all">{id}</span>
        {:else}with d-tag: {dTag}{/if}
      {/if}
    </P>
    <P size="xs" class="mb-6 break-words">
      This could be because the publication doesn't exist, or because the relays are not responding.
    </P>
    <div class="flex space-x-4 mt-4">
      <Button class="btn-leather !w-fit" size="sm" on:click={() => window.location.reload()}>
        Try Again
      </Button>
      <Button class="btn-leather !w-fit" size="sm" outline on:click={() => goto('/')}>
        Return home
      </Button>
    </div>
  </Alert>
</main>
