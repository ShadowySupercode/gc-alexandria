<script lang='ts'>
  import { Avatar } from 'flowbite-svelte';
  import { type NDKUserProfile } from '@nostr-dev-kit/ndk';
  import { ndkInstance } from '$lib/ndk';

  let { pubkey } = $props();

  const externalProfileDestination = 'https://nostree.me/'
  let loading = $state(true);
  let npub = $state('');

  let profile = $state<NDKUserProfile | null>(null);
  let pfp = $derived(profile?.image);
  let username = $derived(profile?.name);

  async function fetchUserData(pubkey: string) {
    const user = $ndkInstance
      .getUser({ pubkey: pubkey ?? undefined });

    npub = user.npub;

    user.fetchProfile()
      .then(userProfile => {
        profile = userProfile;
        loading = false;
      });
  }

  // Fetch data when component mounts
  $effect(() => {
    if (pubkey) {
      fetchUserData(pubkey);
    }
  });


</script>

{#if loading}
  <span>…</span>
{:else if pubkey}
  <Avatar rounded
          class='h-6 w-6 mx-1 cursor-pointer inline'
          src={pfp}
          alt={username} />
  <a class='text-indigo-600 underline' href='{externalProfileDestination}{npub}' target='_blank'>{username}</a>
{:else}
  <span>Not found</span>
{/if}