<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { getNostrClient } from '$lib/nostr/client';
  import type { NostrUser } from '$lib/types/nostr';

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
  let errorMessage = $derived.by(() =>
    signInFailed ? "Failed to sign in. Please try again." : "",
  );

  // Get the Nostr client
  const client = getNostrClient();

  $effect(() => {
    if (client.getActiveUser() && show) {
      onLoginSuccess();
      onClose();
    }
  });

  async function handleSignInClick() {
    try {
      signInFailed = false;

      if (!window.nostr) {
        throw new Error("Nostr WebExtension not found. Please install a Nostr WebExtension like Alby or nos2x.");
      }

      // Get the user's public key from the WebExtension
      const pubkey = await window.nostr.getPublicKey();
      if (!pubkey) {
        throw new Error("The NIP-07 extension did not return a public key.");
      }

      // Create a user object and set it as active
      const user: NostrUser = {
        pubkey,
        validateNip05: async () => false // Default to false, can be updated later
      };
      client.setActiveUser(user);

    } catch (e: unknown) {
      console.error(e);
      signInFailed = true;
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto outline-none focus:outline-none bg-gray-900 bg-opacity-50"
  >
    <div class="relative w-auto my-6 mx-auto max-w-3xl">
      <div
        class="border-0 rounded-lg shadow-lg relative flex flex-col w-full bg-white dark:bg-gray-800 outline-none focus:outline-none"
      >
        <!-- Header -->
        <div
          class="flex items-start justify-between p-5 border-b border-solid border-gray-300 dark:border-gray-600 rounded-t"
        >
          <h3 class="text-xl font-medium text-gray-900 dark:text-gray-100">
            Login Required
          </h3>
          <button
            class="ml-auto bg-transparent border-0 text-gray-400 float-right text-3xl leading-none font-semibold outline-none focus:outline-none"
            onclick={onClose}
          >
            <span
              class="bg-transparent text-gray-500 dark:text-gray-400 h-6 w-6 text-2xl block outline-none focus:outline-none"
              >×</span
            >
          </button>
        </div>

        <!-- Body -->
        <div class="relative p-6 flex-auto">
          <p
            class="text-base leading-relaxed text-gray-500 dark:text-gray-400 mb-6"
          >
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
        </div>
      </div>
    </div>
  </div>
{/if}
