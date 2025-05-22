<script lang='ts'>
  import { type NDKUserProfile } from '@nostr-dev-kit/ndk';
  import { activePubkey, loginWithExtension, ndkInstance, ndkSignedIn, persistLogin } from '$lib/ndk';
  import { Avatar, Button, Popover } from 'flowbite-svelte';
  import Profile from "$components/util/Profile.svelte";

  let profile = $state<NDKUserProfile | null>(null);
  let npub = $state<string | undefined >(undefined);

  let signInFailed = $state<boolean>(false);
  let errorMessage = $state<string>('');

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
      signInFailed = false;
      errorMessage = '';
      
      const user = await loginWithExtension();
      if (!user) {
        throw new Error('The NIP-07 extension did not return a user.');
      }

      profile = await user.fetchProfile();
      persistLogin(user);
    } catch (e) {
      console.error(e);
      signInFailed = true;
      errorMessage = e instanceof Error ? e.message : 'Failed to sign in. Please try again.';
    }
  }

</script>

<div class="m-4">
  {#if $ndkSignedIn}
    <Profile pubkey={$activePubkey} isNav={true} />
  {:else}
    <Avatar rounded class='h-6 w-6 cursor-pointer bg-transparent' id='avatar' />
    <Popover
      class='popover-leather w-fit'
      placement='bottom'
      triggeredBy='#avatar'
    >
      <div class='w-full flex flex-col space-y-2'>
        <Button
          onclick={handleSignInClick}
        >
          Extension Sign-In
        </Button>
        {#if signInFailed}
          <div class="p-2 text-sm text-red-600 bg-red-100 rounded">
            {errorMessage}
          </div>
        {/if}
        <!-- <Button
          color='alternative'
          on:click={signInWithBunker}
        >
          Bunker Sign-In
        </Button> -->
      </div>
    </Popover>
  {/if}
</div>
