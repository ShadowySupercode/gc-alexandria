<script lang='ts'>
  import { Avatar, Button, Popover } from 'flowbite-svelte';
  import { NDKNip07Signer, type NDKUserProfile } from '@nostr-dev-kit/ndk';
  import { ndkInstance, ndkSignedIn } from '$lib/ndk';

  let profile = $state<NDKUserProfile | null>(null);
  let pfp = $derived(profile?.image);
  let username = $derived(profile?.name);
  let tag = $derived(profile?.name);

  const signInWithExtension = async () => {
    const signer = new NDKNip07Signer();
    const user = await signer.user();
    
    // Michael J 01/03/2025 - This updates the shared NDK instance in its store, which is global
    // in scope.  Since this app is not server-side rendered, this is safe.  If we implement
    // server-side rendering, we should migrate this shared state to Svelte's context API.
    user.ndk = $ndkInstance;
    $ndkInstance.signer = signer;
    $ndkInstance.activeUser = user;

    await $ndkInstance.connect();
    profile = await $ndkInstance.activeUser?.fetchProfile();

    console.debug('NDK signed in with extension and reconnected.');

    $ndkSignedIn = true;
  };

  const signInWithBunker = () => {
    console.warn('Bunker sign-in not yet implemented.');
  };
</script>

{#if $ndkSignedIn}
  <Avatar
    rounded
    class='h-6 w-6 m-4 cursor-pointer'
    src={pfp}
    alt={username}
  />
  <Popover
    class='popover-leather w-fit'
    placement='bottom'
    target='avatar'
  >
    <h3 class='text-lg font-bold'>{username}</h3>
    <h4 class='text-base'>@{tag}</h4>
</Popover>
{:else}
  <Avatar rounded class='h-6 w-6 m-4 cursor-pointer' id='avatar' />
  <Popover
    class='popover-leather w-fit'
    placement='bottom'
    target='avatar'
  >
    <div class='w-full flex space-x-2'>
      <Button
        on:click={signInWithExtension}
      >
        Extension Sign-In
      </Button>
      <Button
        color='alternative'
        on:click={signInWithBunker}
      >
        Bunker Sign-In
      </Button>
    </div>
  </Popover>
{/if}
