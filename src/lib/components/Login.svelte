<script lang='ts'>
  import { type NDKUserProfile } from '@nostr-dev-kit/ndk';
  import { activePubkey, loginWithExtension, logout, ndkInstance, ndkSignedIn, persistLogin } from '$lib/ndk';
  import { Avatar, Button, Popover, Tooltip } from 'flowbite-svelte';
  import Profile from "$components/util/Profile.svelte";

  let profile = $state<NDKUserProfile | null>(null);
  let pfp = $derived(profile?.image);
  let username = $derived(profile?.name);
  let tag = $derived(profile?.name);
  let npub = $state<string | undefined >(undefined);

  let signInFailed = $state<boolean>(false);

  $effect(() => {
    if ($ndkSignedIn) {
      $ndkInstance
        .getUser({ pubkey: $activePubkey ?? undefined })
        ?.fetchProfile()
        .then(userProfile => {
          profile = userProfile;
        });
      npub = $ndkInstance.activeUser?.npub;
    }
  });

  async function handleSignInClick() {
    try {
      const user = await loginWithExtension();
      if (!user) {
        throw new Error('The NIP-07 extension did not return a user.');
      }

      profile = await user.fetchProfile();
      persistLogin(user);
    } catch (e) {
      console.error(e);
      signInFailed = true;
      // TODO: Show an error message to the user.
    }
  }

</script>

<div class="m-4">
  {#if $ndkSignedIn}
    <Profile pubkey={$activePubkey} isNav={true} />
  {:else}
    <Avatar rounded class='h-6 w-6 cursor-pointer' id='avatar' />
    <Popover
      class='popover-leather w-fit'
      placement='bottom'
      target='avatar'
    >
      <div class='w-full flex space-x-2'>
        <Button
          onclick={handleSignInClick}
        >
          Extension Sign-In
        </Button>
        <!-- <Button
          color='alternative'
          onclick={signInWithBunker}
        >
          Bunker Sign-In
        </Button> -->
      </div>
    </Popover>
  {/if}
</div>
