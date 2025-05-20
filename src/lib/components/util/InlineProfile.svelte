<script lang='ts'>
  import { Avatar } from 'flowbite-svelte';
  import { type NDKUserProfile } from "@nostr-dev-kit/ndk";
  import { ndkInstance } from '$lib/ndk';
  import { userBadge } from '$lib/snippets/UserSnippets.svelte';
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

{#if loading}
  {title ?? '…'}
{:else if anon }
  {@render userBadge(npub, username)}
{:else if npub }
  <a href='{externalProfileDestination}{npub}' title={title ?? username} target='_blank'>
    <Avatar rounded
          class='h-7 w-7 mx-1 cursor-pointer inline bg-transparent'
          src={pfp}
          alt={username} />
    {@render userBadge(npub, username)}
  </a>
{:else}
  {title ?? pubkey}
{/if}