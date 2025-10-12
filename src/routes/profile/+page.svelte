<script lang="ts">
  import { AAlert, AProfilePreview, AThemeToggleMini } from "$lib/a";
  import CommentBox from "$lib/components/CommentBox.svelte";
  import CommentViewer from "$lib/components/CommentViewer.svelte";
  import { userStore } from "$lib/stores/userStore";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getNdkContext } from "$lib/ndk.ts";
  import { Heading, P } from "flowbite-svelte";
  import ATechToggle from "$lib/a/reader/ATechToggle.svelte";

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
        const meta = await getUserMetadata(user.npub, ndk, true);
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
</script>

{#if !user || !user.signedIn}
  <div class="w-full max-w-3xl mx-auto mt-10 px-4">
    <AAlert color="blue">Please log in to view your profile.</AAlert>
  </div>
{:else}
  <div class="w-full flex justify-center">
    <div class="flex flex-col w-full max-w-5xl my-6 px-4 mx-auto gap-6">
      {#if profileEvent}
        <AProfilePreview event={profileEvent} user={user} profile={profile} loading={loading} error={error} isOwn={!!user?.signedIn && (!profileEvent?.pubkey || profileEvent.pubkey === user.pubkey)} />
      {/if}
      <div class="mt-6">
        <Heading tag="h3" class="h-leather mb-4">
          Settings
        </Heading>
        <!-- Theme and tech settings -->
        <ul>
          <li>
            <ATechToggle />
          </li>
          <li>
            <AThemeToggleMini />
          </li>
        </ul>
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
