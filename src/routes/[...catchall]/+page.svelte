<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Button, P } from 'flowbite-svelte';
</script>

<div class="not-found-container">
  <h1 class="heading-1">404 - Page Not Found</h1>
  <P class="text-secondary mb-6">The page you are looking for does not exist or has been moved.</P>
  <div class="not-found-actions">
    <Button class="btn-base" on:click={() => goto('/')}>Return to Home</Button>
    <Button class="btn-secondary" on:click={() => window.history.back()}>Go Back</Button>
  </div>
</div>
