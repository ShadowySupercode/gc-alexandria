<script lang="ts">
  import { Button } from "flowbite-svelte";
  import Login from './Login.svelte';
  import { ndkSignedIn } from '$lib/ndk';
  
  const { show = false, onClose = () => {}, onLoginSuccess = () => {} } = $props<{
    show?: boolean;
    onClose?: (event: MouseEvent) => void;
    onLoginSuccess?: () => void;
  }>();

  $effect(() => {
    if ($ndkSignedIn && show) {
      onLoginSuccess();
      onClose(new MouseEvent('click'));
    }
  });
</script>

{#if show}
  <div class="modal-container">
    <Button
      class="modal-backdrop"
      aria-label="Close modal"
      color="none"
      style="position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.5);"
      onclick={onClose}
    ></Button>
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Login Required</h3>
        <Button
          class="modal-close"
          type="button"
          aria-label="Close"
          color="light"
          onclick={onClose}
        >
          <span>×</span>
        </Button>
      </div>
      <div class="modal-body">
        <p class="text-secondary mb-4">
          You need to be logged in to submit an issue. Your form data will be preserved.
        </p>
        <div class="flex justify-center">
          <Login />
        </div>
      </div>
    </div>
  </div>
{/if}