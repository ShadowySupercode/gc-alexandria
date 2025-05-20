<script lang='ts'>
  import { Avatar } from 'flowbite-svelte';
  import { type NDKUserProfile } from "@nostr-dev-kit/ndk";
  import { ndkInstance } from '$lib/ndk';

  let { pubkey, title = null } = $props();

  const externalProfileDestination = 'https://njump.me/'
  let loading = $state(true);
  let anon = $state(false);
  let npub = $state('');

  let profile = $state<NDKUserProfile | null>(null);
  let pfp = $derived(profile?.image);
  let username = $derived(profile?.name);

  async function fetchUserData(pubkey: string) {
    let user;
      user = $ndkInstance
        .getUser({ pubkey: pubkey ?? undefined });

    npub = user.npub;

    user.fetchProfile()
      .then(userProfile => {
        profile = userProfile;
        if (!profile?.name) anon = true;
        loading = false;
      });
  }

  // Fetch data when component mounts
  $effect(() => {
    if (pubkey) {
      fetchUserData(pubkey);
    }
  });

  function shortenNpub(long: string|undefined) {
    if (!long) return '';
    return long.slice(0, 8) + '…' + long.slice(-4);
  }
</script>

<!-- TODO: Use userBadge snippet here to add verification badges. -->
{#if loading}
  {title ?? '…'}
{:else if anon }
  <a class='underline' href='{externalProfileDestination}{npub}' title={title ?? npub} target='_blank'>{shortenNpub(npub)}</a>
{:else if npub }
  <a href='{externalProfileDestination}{npub}' title={title ?? username} target='_blank'>
    <Avatar rounded
          class='h-6 w-6 mx-1 cursor-pointer inline bg-transparent'
          src={pfp}
          alt={username} />
    <span class='underline'>{username ?? shortenNpub(npub)}</span>
  </a>
{:else}
  {title ?? pubkey}
{/if}