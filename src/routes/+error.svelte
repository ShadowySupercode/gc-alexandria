<script lang="ts">
  import { invalidateAll, goto } from "$app/navigation";
  import { Alert, Button } from "flowbite-svelte";
  import { ExclamationCircleOutline } from "flowbite-svelte-icons";
  import { page } from "$app/state";

  let showDetails = false;
</script>

<div class="leather mt-[76px] h-full w-full flex flex-col items-center bg-leather">
  <div class="flex-1 flex flex-col items-center justify-center w-full">
    <div class="leather w-full max-w-md p-6 rounded-xl shadow-lg border border-red-200 bg-leather">
      <Alert color="red" class="w-full" style="background: transparent;">
        <div class="flex items-center space-x-3 mb-4">
          <ExclamationCircleOutline class="w-10 h-10 text-red-500" />
          <span class="text-2xl font-bold text-red-700">Something went wrong</span>
        </div>
        <div class="mb-4 text-stone-700">
          Sorry, we couldn't load this page.<br />
          Please try again, or return to the home page.
        </div>
        <div class="flex space-x-2 mb-4">
          <Button
            size="sm"
            class="btn-leather"
            on:click={() => invalidateAll()}
          >
            Try Again
          </Button>
          <Button
            size="sm"
            outline
            class="btn-leather"
            on:click={() => goto('/')}
          >
            Return home
          </Button>
        </div>
        <div>
          <Button
            size="xs"
            color="red"
            outline
            class="mb-2"
            on:click={() => (showDetails = !showDetails)}
          >
            {showDetails ? 'Hide details' : 'Show technical details'}
          </Button>
          {#if showDetails}
            <pre class="bg-stone-100 text-xs p-3 rounded border border-stone-200 overflow-x-auto transition-all duration-300 mt-2">
{page.error?.message}
{#if (page.error as any)?.stack}

Stack trace:
{(page.error as any).stack}
{/if}
            </pre>
          {/if}
        </div>
      </Alert>
    </div>
  </div>
</div>
