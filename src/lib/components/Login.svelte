<script lang="ts">
  import type { NostrProfile } from '$lib/utils/types';
  import { getUserMetadata } from '$lib/utils';
  import { getNostrClient } from '$lib/nostr/client';
  import type { NostrUser } from '$lib/types/nostr';
  import { Avatar, Button, Popover } from "flowbite-svelte";
  import Profile from "$components/util/Profile.svelte";
  import SettingsModal from "$components/SettingsModal.svelte";
  import { ArrowRightToBracketOutline, CogOutline } from 'flowbite-svelte-icons';
  import { userInboxRelays, userOutboxRelays } from '$lib/stores/relayStore';
  import { userStore } from '$lib/stores/userStore';

  console.log('[Login] Login.svelte component loaded');

  let profile = $state<NostrProfile | null>(null);
  let showSettings = $state(false);

  let signInFailed = $state<boolean>(false);
  let errorMessage = $derived.by(() =>
    signInFailed ? "Failed to sign in. Please try again." : "",
  );

  // Get the Nostr client
  const client = getNostrClient();

  // Track login state
  let isLoggedIn = $derived(() => !!$userStore);

  $effect(() => {
    if (isLoggedIn()) {
      const user = client.getActiveUser();
      if (user?.pubkey) {
        getUserMetadata(user.pubkey).then((metadata) => {
          console.log('[Login] Profile metadata:', metadata);
          profile = metadata;
        });
      }
    }
  });

  async function handleSignInClick() {
    try {
      console.log('[Login] Sign-in button clicked');
      signInFailed = false;

      if (!window.nostr) {
        console.error('[Login] Nostr WebExtension not found');
        throw new Error("Nostr WebExtension not found. Please install a Nostr WebExtension like Alby or nos2x.");
      }

      console.log('[Login] Nostr extension detected:', window.nostr);

      // Get the user's public key from the WebExtension
      const pubkey = await window.nostr.getPublicKey();
      console.log('[Login] Received pubkey from extension:', pubkey);
      if (!pubkey) {
        console.error('[Login] No pubkey returned from extension');
        throw new Error("The NIP-07 extension did not return a public key.");
      }

      // Create a user object and set it as active
      const user: NostrUser = {
        pubkey,
        validateNip05: async () => false // Default to false, can be updated later
      };
      client.setActiveUser(user);
      userStore.set(user);
      console.log('[Login] Set active user:', user);

      // Fetch and set user relays
      const [inboxSet, outboxSet] = await client.getUserPreferredRelays(user);
      console.log('[Login] User relays fetched:', { inbox: Array.from(inboxSet), outbox: Array.from(outboxSet) });
      userInboxRelays.set(Array.from(inboxSet));
      userOutboxRelays.set(Array.from(outboxSet));

      // Get user metadata
      const metadata = await getUserMetadata(pubkey);
      console.log('[Login] User metadata fetched:', metadata);
      profile = metadata;

      console.log('[Login] Sign-in flow completed successfully');
    } catch (e) {
      console.error('[Login] Sign-in failed:', e);
      signInFailed = true;
    }
  }
</script>

<div class="m-4">
  {#if isLoggedIn()}
    <Profile pubkey={client.getActiveUser()?.pubkey} />
  {:else}
    <Avatar rounded class="h-6 w-6 cursor-pointer bg-transparent" id="avatar" />
    <Popover
      class="popover-leather w-80"
      placement="bottom"
      triggeredBy="#avatar"
    >
      <div class="flex flex-col gap-1 text-left">
        <div class="font-bold text-lg text-primary-700 dark:text-primary-400 mb-2 text-left w-full inline-block transition-colors hover:text-primary-400 dark:hover:text-primary-500">No user logged in</div>
        <Button
          color="none"
          class="flex items-center justify-start gap-2 px-2 py-2 rounded text-gray-900 font-medium w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100"
          onclick={() => { console.log('[Login] Button clicked'); handleSignInClick(); }}
        >
          <ArrowRightToBracketOutline class="h-5 w-5 text-gray-500" />
          <span class="transition-colors hover:text-primary-400 dark:hover:text-primary-500">Extension Sign-In</span>
        </Button>
        <Button
          color="none"
          class="flex items-center justify-start gap-2 px-2 py-2 rounded text-gray-900 font-medium w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100"
          onclick={() => (showSettings = true)}
        >
          <CogOutline class="h-5 w-5 text-gray-500" />
          <span class="transition-colors hover:text-primary-400 dark:hover:text-primary-500">Settings</span>
        </Button>
        {#if signInFailed}
          <div class="p-2 text-sm text-red-600 bg-red-100 rounded mt-1">
            {errorMessage}
          </div>
        {/if}
      </div>
    </Popover>
    <SettingsModal show={showSettings} onClose={() => (showSettings = false)} />
  {/if}
</div>
