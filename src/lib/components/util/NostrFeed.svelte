<script lang='ts'>
  import { ndkInstance } from '$lib/ndk';
  import { onMount } from 'svelte';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { P, Spinner, Img } from 'flowbite-svelte';
  import InlineProfile from './InlineProfile.svelte';
  import { standardRelays } from '$lib/consts';
  
  // Import our utility modules
  import { parseContent, processContentSegments, isBoost, extractRepostedContent, formatDate, extractPubkeyFromNpub } from './nostr/utils';
  import { fetchNotes, fetchEvents } from './nostr/eventFetcher';
  import { fetchProfile, fetchProfilesByPubkeys, collectReferencesFromNotes } from './nostr/profileFetcher';
  import type { ProfileData } from './nostr/types';
  import NestedContent from './nostr/NestedContent.svelte';

  let { pubkey, relayUrl, limit = 10 } = $props<{ 
    pubkey: string;
    relayUrl: string;
    limit?: number;
  }>();

  let notes: NDKEvent[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  
  // Store for user profiles and event content
  let profileCache = $state(new Map<string, ProfileData>());
  let eventCache = $state(new Map<string, NDKEvent>());
  
  // Function to fetch a profile and update the cache
  async function fetchProfileAndUpdateCache(pubkey: string): Promise<void> {
    profileCache = await fetchProfile($ndkInstance, pubkey, profileCache);
  }
  
  // Main function to load notes and related data
  async function loadData() {
    try {
      loading = true;
      error = null;
      
      console.log(`Starting to fetch notes for pubkey: ${pubkey} from relay: ${relayUrl}`);
      
      // Try to fetch notes from the specified relay
      try {
        notes = await fetchNotes($ndkInstance, pubkey, relayUrl, limit);
        console.log(`Fetched ${notes.length} notes from ${relayUrl}:`, notes);
      } catch (relayError) {
        console.error(`Error fetching from primary relay ${relayUrl}:`, relayError);
        
        // If the primary relay fails, try the standard relays
        console.log("Trying standard relays as fallback...");
        for (const standardRelay of standardRelays) {
          if (standardRelay !== relayUrl) {
            try {
              console.log(`Trying fallback relay: ${standardRelay}`);
              notes = await fetchNotes($ndkInstance, pubkey, standardRelay, limit);
              console.log(`Fetched ${notes.length} notes from fallback relay ${standardRelay}:`, notes);
              if (notes.length > 0) {
                break; // Stop trying more relays if we got some notes
              }
            } catch (fallbackError) {
              console.error(`Error fetching from fallback relay ${standardRelay}:`, fallbackError);
            }
          }
        }
      }
      
      if (notes.length === 0) {
        console.log("No notes found from any relay, stopping here");
        loading = false;
        return;
      }
      
      // Collect all referenced pubkeys and nevents
      const { pubkeys, nevents } = collectReferencesFromNotes(notes);
      
      // Fetch profiles for all pubkeys
      profileCache = await fetchProfilesByPubkeys(
        $ndkInstance, 
        Array.from(pubkeys), 
        profileCache
      );
      
      // Fetch content for all nevents
      if (nevents.size > 0) {
        eventCache = await fetchEvents(
          $ndkInstance,
          Array.from(nevents),
          relayUrl,
          eventCache,
          profileCache,
          fetchProfileAndUpdateCache
        );
      }
      
    } catch (e) {
      console.error('Error loading data:', e);
      error = `Failed to load data: ${e}`;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await loadData();
  });
</script>

<div class="nostr-feed leather flex flex-col space-y-4">
  {#if loading}
    <div class="flex justify-center py-4">
      <Spinner size="8" />
    </div>
  {:else if error}
    <P class="text-red-500">{error}</P>
  {:else if notes.length === 0}
    <P class="text-center">No notes found.</P>
  {:else}
    {#each notes as note}
      <div class="note-card p-4 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="flex items-start space-x-2 mb-2">
          <InlineProfile pubkey={note.pubkey} />
          <span class="text-sm text-gray-500 ml-auto">{formatDate(note.created_at)}</span>
        </div>
        
        {#if isBoost(note)}
          {#if extractRepostedContent(note)}
            <div class="reposted-content mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-start space-x-2 mb-2">
                <InlineProfile pubkey={extractRepostedContent(note)?.pubkey || ''} />
              </div>
              {#if extractRepostedContent(note)}
                <!-- Use NestedContent component for reposted content with nesting level 2 -->
                <NestedContent 
                  content={extractRepostedContent(note)?.content || ''} 
                  nestingLevel={2} 
                  eventCache={eventCache} 
                  profileCache={profileCache}
                  ndkInstance={$ndkInstance}
                />
              {/if}
            </div>
          {/if}
        {:else}
          {#if note.content}
            <!-- Use NestedContent component for note content with nesting level 1 -->
            <NestedContent 
              content={note.content} 
              nestingLevel={1} 
              eventCache={eventCache} 
              profileCache={profileCache}
              ndkInstance={$ndkInstance}
            />
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
