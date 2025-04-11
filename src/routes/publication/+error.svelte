<script lang='ts'>
  import { invalidateAll, goto } from '$app/navigation';
  import { Alert, P, Button } from 'flowbite-svelte';
  import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
  import { page } from '$app/state';
</script>

<main class="flex flex-col items-center justify-center min-h-screen p-4">
  <Alert class="max-w-md">
    <div class='flex items-center space-x-2 mb-4'>
      <ExclamationCircleOutline class='w-6 h-6' />
      <span class='text-lg font-medium'>
        Failed to load publication.
      </span>
    </div>
    <P size='sm' class="mb-4">
      Alexandria failed to find one or more of the events comprising this publication.
    </P>
    <P size='xs' class="mb-6 break-words">
      {page.error?.message}
    </P>
    <div class='flex space-x-4 mt-4'>
      <Button class='btn-leather !w-fit' size='sm' on:click={() => invalidateAll()}>
        Try Again
      </Button>
      <Button class='btn-leather !w-fit' size='sm' outline on:click={() => goto('/')}>
        Return home
      </Button>
    </div>
  </Alert>
</main>
