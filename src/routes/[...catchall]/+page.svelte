<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Button, P } from 'flowbite-svelte';
</script>

<div class="flex flex-col items-center justify-center min-h-screen text-center px-4">
  <h1 class="text-4xl font-bold mb-4">404 - Page Not Found</h1>
  <P class="mb-6">The page you are looking for does not exist or has been moved.</P>
  <div class="flex space-x-4">
    <Button class="btn-leather" on:click={() => goto('/')}>Return to Home</Button>
    <Button class="btn-leather" outline on:click={() => window.history.back()}>Go Back</Button>
  </div>
</div>
