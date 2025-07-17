<script lang="ts">
  import { Button, Modal } from "flowbite-svelte";
  import { loginWithExtension, ndkSignedIn } from "$lib/ndk";

  const {
    show = false,
    onClose = () => {},
    onLoginSuccess = () => {},
  } = $props<{
    show?: boolean;
    onClose?: () => void;
    onLoginSuccess?: () => void;
  }>();

  let signInFailed = $state<boolean>(false);
  let errorMessage = $state<string>("");
  let modalOpen = $state(show);

  $effect(() => {
    modalOpen = show;
  });

  $effect(() => {
    if ($ndkSignedIn && show) {
      onLoginSuccess();
      onClose();
    }
  });

  $effect(() => {
    if (!modalOpen) {
      onClose();
    }
  });

  async function handleSignInClick() {
    try {
      signInFailed = false;
      errorMessage = "";

      const user = await loginWithExtension();
      if (!user) {
        throw new Error("The NIP-07 extension did not return a user.");
      }
    } catch (e: unknown) {
      console.error(e);
      signInFailed = true;
      errorMessage =
        (e as Error)?.message ?? "Failed to sign in. Please try again.";
    }
  }
</script>

<Modal
  class="modal-leather"
  title="Login Required"
  bind:open={modalOpen}
  autoclose
  outsideclose
  size="sm"
>
  <p class="text-base leading-relaxed text-gray-700 dark:text-gray-300 mb-6">
    You need to be logged in to submit an issue. Your form data will be
    preserved.
  </p>
  <div class="flex flex-col space-y-4">
    <div class="flex justify-center">
      <Button color="primary" onclick={handleSignInClick}>
        Sign in with Extension
      </Button>
    </div>
    {#if signInFailed}
      <div
        class="p-3 text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900 rounded"
      >
        {errorMessage}
      </div>
    {/if}
  </div>
</Modal>
