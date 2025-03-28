<script lang='ts'>
  import { invalidateAll, goto } from '$app/navigation';
  import { Alert, P, Button } from 'flowbite-svelte';
  import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
  import { page } from '$app/state';
</script>

<main>
  <Alert>
    <div class='flex items-center space-x-2'>
      <ExclamationCircleOutline class='w-6 h-6' />
      <span class='text-lg font-medium'>
        Failed to load publication.
      </span>
    </div>
    <P size='sm'>
      Alexandria failed to find one or more of the events comprising this publication.
    </P>
    <P size='xs'>
      {page.error?.message}
    </P>
    <div class='flex space-x-2'>
      <Button class='btn-leather !w-fit' size='sm' onclick={() => invalidateAll()}>
        Try Again
      </Button>
      <Button class='btn-leather !w-fit' size='sm' outline onclick={() => goto('/')}>
        Return to Home
      </Button>
    </div>
  </Alert>
</main>