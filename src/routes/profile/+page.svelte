<script lang="ts">
  import { Heading, P, Button } from "flowbite-svelte";
  import { AAlert } from "$lib/a";
  import CommentBox from "$lib/components/CommentBox.svelte";
  import CommentViewer from "$lib/components/CommentViewer.svelte";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { userStore } from "$lib/stores/userStore";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getNdkContext } from "$lib/ndk.ts";
  import { goto } from "$app/navigation";

  // State
  let user = $state($userStore);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let profileEvent = $state<NDKEvent | null>(null);
  let profile = $state<{
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
  } | null>(null);
  let lastFetchedPubkey: string | null = null;
  let userRelayPreference = $state(false); // required by CommentBox

  userStore.subscribe(v => user = v);

  async function fetchProfileEvent(pubkey: string) {
    if (!pubkey || pubkey === lastFetchedPubkey) return;
    loading = true;
    error = null;
    try {
      const ndk = getNdkContext();
      if (!ndk) {
        throw new Error('NDK not initialized');
      }
      // Fetch kind 0 event for this author
      const evt = await ndk.fetchEvent({ kinds: [0], authors: [pubkey] });
      profileEvent = evt || null;
      if (evt?.content) {
        try { profile = JSON.parse(evt.content); } catch { profile = null; }
      } else {
        profile = null;
      }
      // Fallback: ensure we have metadata via helper (will cache)
      if (!profile && user.npub) {
        const meta = await getUserMetadata(user.npub, true);
        profile = {
          name: meta.name,
          display_name: meta.displayName,
          about: meta.about,
          picture: meta.picture,
          banner: meta.banner,
          website: meta.website,
          lud16: meta.lud16,
          nip05: meta.nip05,
        };
      }
      lastFetchedPubkey = pubkey;
    } catch (e: any) {
      console.error('[profile/+page] Failed to fetch profile event', e);
      error = e?.message || 'Failed to load profile';
    } finally {
      loading = false;
    }
  }

  // Reactive: when user login changes fetch profile event
  $effect(() => {
    if (user?.pubkey) fetchProfileEvent(user.pubkey);
  });

  function displayName() {
    return profile?.display_name || profile?.name || (user?.npub ? user.npub.slice(0, 10) + '…' : '');
  }

  function shortNpub() {
    if (!user?.npub) return '';
    return user.npub.slice(0, 12) + '…' + user.npub.slice(-8);
  }
</script>

{#if !user || !user.signedIn}
  <div class="w-full max-w-3xl mx-auto mt-10 px-4">
    <AAlert color="blue">Please log in to view your profile.</AAlert>
  </div>
{:else}
  <div class="w-full flex justify-center">
    <div class="flex flex-col w-full max-w-5xl my-6 px-4 mx-auto gap-6">
      <div class="main-leather p-0 overflow-hidden rounded-lg border border-primary-200 dark:border-primary-700">
        {#if profile?.banner}
          <div class="w-full h-40 bg-primary-200 dark:bg-primary-800 relative">
            <img src={profile.banner} alt="Banner" class="w-full h-full object-cover" loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
            {#if profile?.picture}
              <img src={profile.picture} alt="Avatar" class="absolute -bottom-10 left-6 w-24 h-24 object-cover rounded-full border-4 border-white dark:border-gray-900 bg-gray-100" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
            {/if}
          </div>
        {/if}
        <div class={`p-6 ${profile?.banner ? 'pt-16' : 'pt-6'} flex flex-col gap-4`}>
          {#if !profile?.banner && profile?.picture}
            <img src={profile.picture} alt="Avatar" class="w-32 h-32 object-cover rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100" loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
          {/if}
          <div>
            <Heading tag="h1" class="h-leather mb-2">{displayName()}</Heading>
            <div class="flex flex-row flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              {#if user.npub}
                <CopyToClipboard displayText={shortNpub()} copyText={user.npub} />
              {/if}
              {#if profile?.nip05}
                <span class="px-2 py-0.5 !mb-0 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs">{profile.nip05}</span>
              {/if}
              {#if profile?.lud16}
                <span class="px-2 py-0.5 !mb-0 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs">⚡ {profile.lud16}</span>
              {/if}
            </div>
          </div>
          {#if profile?.about}
            <P class="whitespace-pre-wrap break-words leading-relaxed">{profile.about}</P>
          {/if}
          <div class="flex flex-wrap gap-4 text-sm">
            {#if profile?.website}
              <a href={profile.website} rel="noopener" class="text-primary-600 dark:text-primary-400 hover:underline break-all" target="_blank">{profile.website}</a>
            {/if}
          </div>
          <div class="flex flex-row justify-end gap-4 text-sm">
            <Button size="xs" onclick={() => goto('/profile/notifications')}>Notifications</Button>
          </div>
          {#if loading}
            <AAlert color="primary">Loading profile…</AAlert>
          {/if}
          {#if error}
            <AAlert color="red">Error loading profile: {error}</AAlert>
          {/if}
        </div>
      </div>

      {#if profileEvent}
        <div class="main-leather flex flex-col space-y-6">
          <CommentViewer event={profileEvent} />
          <CommentBox event={profileEvent} {userRelayPreference} />
        </div>
      {:else if !loading}
        <AAlert color="gray">No profile event (kind 0) found for this user.</AAlert>
      {/if}
    </div>
  </div>
{/if}
