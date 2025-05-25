<script lang="ts">
  import { type NostrProfile, getUserMetadata } from "$lib/utils/nostrUtils";
  import {
    activePubkey,
    loginWithExtension,
    ndkInstance,
    ndkSignedIn,
    persistLogin,
  } from "$lib/ndk";
  import { Avatar, Button, Popover } from "flowbite-svelte";
  import Profile from "$components/util/Profile.svelte";

  let profile = $state<NostrProfile | null>(null);

  let signInFailed = $state<boolean>(false);
  let errorMessage = $derived.by(() =>
    signInFailed ? "Failed to sign in. Please try again." : "",
  );

  $effect(() => {
    if ($ndkSignedIn && $ndkInstance.activeUser?.npub) {
      getUserMetadata($ndkInstance.activeUser.npub).then((metadata) => {
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
      class="popover-leather w-fit"
      placement="bottom"
      triggeredBy="#avatar"
    >
      <div class="w-full flex flex-col space-y-2">
        <Button onclick={handleSignInClick}>Extension Sign-In</Button>
        {#if signInFailed}
          <div class="p-2 text-sm text-red-600 bg-red-100 rounded">
            {errorMessage}
          </div>
        {/if}
      </div>
    </Popover>
  {/if}
</div>
