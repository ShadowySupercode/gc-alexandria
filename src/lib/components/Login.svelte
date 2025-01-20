<script lang='ts'>
  import { Avatar, Button, Popover } from 'flowbite-svelte';
  import { type NDKUserProfile } from '@nostr-dev-kit/ndk';
  import { ndkSignedIn, loginWithExtension, persistLogin } from '$lib/ndk';

  let profile = $state<NDKUserProfile | null>(null);
  let pfp = $derived(profile?.image);
  let username = $derived(profile?.name);
  let tag = $derived(profile?.name);

  let signInFailed = $state<boolean>(false);

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

  async function handleSignOutClick() {
    logout($ndkInstance.activeUser!);
    profile = null;
  }
</script>

{#if $ndkSignedIn}
  <Avatar
    rounded
    class='h-6 w-6 m-4 cursor-pointer'
    src={pfp}
    alt={username}
  />
  {#key username || tag}
    <Popover
      class='popover-leather w-fit'
      placement='bottom'
      target='avatar'
    >
      <h3 class='text-lg font-bold'>{username}</h3>
      <h4 class='text-base'>@{tag}</h4>
    </Popover>
  {/key}
{:else}
  <Avatar rounded class='h-6 w-6 m-4 cursor-pointer' id='avatar' />
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
        on:click={signInWithBunker}
      >
        Bunker Sign-In
      </Button> -->
    </div>
  </Popover>
{/if}
