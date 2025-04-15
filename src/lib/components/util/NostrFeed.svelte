<script lang='ts'>
  import { ndkInstance } from '$lib/ndk';
  import { onMount } from 'svelte';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { P, Spinner, Img, Modal, Button } from 'flowbite-svelte';
  import InlineProfile from './InlineProfile.svelte';
  import { standardRelays } from '$lib/consts';
  
  // Import our utility modules
  import { parseContent, processContentSegments, isBoost, extractRepostedContent, formatDate, extractPubkeyFromNpub } from './nostr/utils';
  import { parseMarkdown } from './markdown';
  import { nip19 } from 'nostr-tools';
  import { fetchNotes, fetchEvents } from './nostr/eventFetcher';
  import { fetchProfile, fetchProfilesByPubkeys, collectReferencesFromNotes } from './nostr/profileFetcher';
  import type { ProfileData } from './nostr/types';
  import NestedContent from './nostr/NestedContent.svelte';
  
  // For JSON modal
  let jsonModalOpen = $state(false);
  let currentNoteJson = $state('');
  
  // Function to generate a Njump URL for an event
  function getNjumpUrl(note: NDKEvent): string {
    try {
      // Create a nevent identifier for the note
      const nevent = nip19.neventEncode({
        id: note.id,
        author: note.pubkey,
        kind: note.kind,
        relays: disableFallback ? [relayUrl] : [relayUrl, ...standardRelays]
      });
      return `https://njump.me/${nevent}`;
    } catch (e) {
      console.error('Error generating Njump URL:', e);
      // Fallback to a basic URL if encoding fails
      return `https://njump.me/note1${note.id}`;
    }
  }

let { pubkey, relayUrl, limit = 10, disableFallback = false } = $props<{ 
  pubkey: string;
  relayUrl: string;
  limit?: number;
  disableFallback?: boolean;
}>();

  let notes: NDKEvent[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  
  // Store for user profiles and event content
  let profileCache = $state(new Map<string, ProfileData>());
  let eventCache = $state(new Map<string, NDKEvent>());
  
  // Function to fetch a profile and update the cache
  async function fetchProfileAndUpdateCache(pubkey: string): Promise<void> {
    profileCache = await fetchProfile($ndkInstance, pubkey, profileCache, disableFallback, relayUrl);
  }
  
  // Main function to load notes and related data
  async function loadData() {
    try {
      loading = true;
      error = null;
      
      console.log(`Starting to fetch notes for pubkey: ${pubkey} from relay: ${relayUrl}`);
      
      // Try to fetch notes from the specified relay
      try {
        notes = await fetchNotes($ndkInstance, pubkey, relayUrl, limit, disableFallback);
        console.log(`Fetched ${notes.length} notes from ${relayUrl}:`, notes);
      } catch (relayError) {
        console.error(`Error fetching from primary relay ${relayUrl}:`, relayError);
        
        // If the primary relay fails and fallbacks are not disabled, try the standard relays
        if (!disableFallback) {
          console.log("Trying standard relays as fallback...");
          for (const standardRelay of standardRelays) {
            if (standardRelay !== relayUrl) {
              try {
                console.log(`Trying fallback relay: ${standardRelay}`);
                notes = await fetchNotes($ndkInstance, pubkey, standardRelay, limit, false);
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
      }
      
      if (notes.length === 0) {
        console.log("No notes found from any relay, stopping here");
        loading = false;
        return;
      }
      
      try {
        // Collect all referenced pubkeys and nevents
        const { pubkeys, nevents } = collectReferencesFromNotes(notes);
        
        // Fetch profiles for all pubkeys
        profileCache = await fetchProfilesByPubkeys(
          $ndkInstance, 
          Array.from(pubkeys), 
          profileCache,
          disableFallback,
          relayUrl
        );
        
        // Fetch content for all nevents
        if (nevents.size > 0) {
          eventCache = await fetchEvents(
            $ndkInstance,
            Array.from(nevents),
            relayUrl,
            eventCache,
            profileCache,
            fetchProfileAndUpdateCache,
            disableFallback,
            pubkey // Pass the author's pubkey for fetching their preferred relays
          );
        }
      } catch (e) {
        console.error('Error processing notes:', e);
        // Even if there's an error processing notes, we still want to display the notes we have
        // So we don't set an error message here, just log it
      }
      
    } catch (e) {
      console.error('Error loading data:', e);
      error = `Failed to load data: ${e}`;
    } finally {
      // Always set loading to false, even if there was an error
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
      <div class="note-card p-4 rounded-lg border-2 border-primary-200 dark:border-primary-700 shadow-sm bg-gray-50 dark:bg-gray-800 overflow-hidden">
        <div class="flex items-start space-x-2 mb-2">
          <InlineProfile pubkey={note.pubkey} disableFallback={disableFallback} relayUrl={relayUrl} />
          <span class="text-sm text-gray-500 ml-auto">{formatDate(note.created_at)}</span>
        </div>
        <div class="flex justify-end space-x-3 mb-2">
          <!-- View on Njump icon -->
          <a 
            href={getNjumpUrl(note)} 
            target="_blank"
            class="text-primary-400 hover:text-primary-500 dark:hover:text-primary-300"
            title="View on Njump"
            aria-label="View on Njump"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          
          <!-- View Details icon -->
          <button 
            class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            onclick={() => {
              // Create a clean object with just the relevant properties
              const cleanNote = {
                id: note.id,
                pubkey: note.pubkey,
                created_at: note.created_at,
                kind: note.kind,
                tags: note.tags,
                content: note.content,
                sig: note.sig
              };
              // Create a pretty-printed JSON string
              currentNoteJson = JSON.stringify(cleanNote, null, 2);
              // Open the modal to display the JSON
              jsonModalOpen = true;
            }}
            title="View JSON Details"
            aria-label="View JSON Details"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
        
        <!-- Display title, image, and description/summary tags -->
        {#if note.tags}
          {@const titleTag = note.tags.find(tag => tag[0] === 'title')}
          {@const imageTag = note.tags.find(tag => tag[0] === 'image')}
          {@const descriptionTag = note.tags.find(tag => tag[0] === 'description')}
          {@const summaryTag = note.tags.find(tag => tag[0] === 'summary')}
          
          {#if titleTag || imageTag || descriptionTag || summaryTag}
            <div class="note-header mb-4">
              {#if titleTag}
                <h3 class="text-xl font-bold mb-2">{titleTag[1]}</h3>
              {/if}
              
              {#if descriptionTag || summaryTag}
                <p class="text-gray-600 dark:text-gray-300 mb-2">
                  {descriptionTag ? descriptionTag[1] : summaryTag ? summaryTag[1] : ''}
                </p>
              {/if}
              
              {#if imageTag}
                <div class="mb-3">
                  <img src={imageTag[1]} alt="Note image" class="rounded-lg max-h-64 object-cover" />
                </div>
              {/if}
              
              <hr class="border-gray-200 dark:border-gray-700 my-3" />
            </div>
          {/if}
        {/if}
        
        {#if isBoost(note)}
          {#if extractRepostedContent(note)}
            <div class="reposted-content mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-start space-x-2 mb-2">
                <InlineProfile pubkey={extractRepostedContent(note)?.pubkey || ''} disableFallback={disableFallback} relayUrl={relayUrl} />
              </div>
              {#if extractRepostedContent(note)}
                <!-- Use NestedContent component for reposted content with nesting level 2 -->
                <NestedContent 
                  content={extractRepostedContent(note)?.content || ''} 
                  nestingLevel={2} 
                  eventCache={eventCache} 
                  profileCache={profileCache}
                  ndkInstance={$ndkInstance}
                  disableFallback={disableFallback}
                  relayUrl={relayUrl}
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
              disableFallback={disableFallback}
              relayUrl={relayUrl}
            />
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>

<!-- JSON Details Modal -->
<Modal bind:open={jsonModalOpen} size="lg" autoclose>
  <div class="p-4">
    <h3 class="mb-4 text-xl font-medium text-gray-900 dark:text-white">Event Details</h3>
    <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-auto max-h-[70vh]">
      <pre class="whitespace-pre-wrap break-words text-sm">{currentNoteJson}</pre>
    </div>
  </div>
  <svelte:fragment slot="footer">
    <Button color="alternative" onclick={() => jsonModalOpen = false}>Close</Button>
  </svelte:fragment>
</Modal>
