<script lang="ts">
  import { type NostrProfile, getUserMetadata } from "$lib/utils/nostrUtils";
  import {
    activePubkey,
    loginWithExtension,
    ndkSignedIn,
    persistLogin,
    getActiveUser,
  } from "$lib/ndk";
  import { Avatar, Button, Popover } from "flowbite-svelte";
  import Profile from "$components/util/Profile.svelte";
  import SettingsModal from "$components/SettingsModal.svelte";
  import { ArrowRightToBracketOutline, CogOutline } from 'flowbite-svelte-icons';

  let profile = $state<NostrProfile | null>(null);
  let showSettings = $state(false);

  let signInFailed = $state<boolean>(false);
  let errorMessage = $derived.by(() =>
    signInFailed ? "Failed to sign in. Please try again." : "",
  );

  $effect(() => {
    const user = getActiveUser();
    if ($ndkSignedIn && user?.npub) {
      getUserMetadata(user.npub).then((metadata) => {
        profile = metadata;
      });
    }
  });

  async function handleSignInClick() {
    try {
      signInFailed = false;

      const user = await loginWithExtension();
      if (!user) {
        throw new Error("The NIP-07 extension did not return a user.");
      }

      if (user.npub) {
        profile = await getUserMetadata(user.npub);
      }
      persistLogin(user);
    } catch (e) {
      console.error(e);
      signInFailed = true;
    }
  }
</script>

<div class="m-4">
  {#if $ndkSignedIn}
    <Profile pubkey={$activePubkey} />
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
          onclick={handleSignInClick}
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
