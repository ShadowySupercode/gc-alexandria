<script lang='ts'>
  import { ndkInstance } from '$lib/ndk';
  import { onMount } from 'svelte';
  import { NDKEvent } from '@nostr-dev-kit/ndk';
  import { P, Spinner } from 'flowbite-svelte';
  import { extractPubkeyFromNpub } from './nostr/utils';
  import type { ProfileData } from './nostr/types';
  import NostrEventCard from './nostr/NostrEventCard.svelte';
  import EventDetailsModal from './nostr/EventDetailsModal.svelte';
  import { 
    deleteEvent, 
    broadcastEvent, 
    loadNostrFeedData, 
    setupEventDetailsListener 
  } from './nostr/NostrFeedUtils';

  // Props
  let { pubkey, relayUrl, limit = 10, disableFallback = false } = $props<{ 
    pubkey: string;
    relayUrl: string;
    limit?: number;
    disableFallback?: boolean;
  }>();

  // State
  let notes: NDKEvent[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let jsonModalOpen = $state(false);
  let currentNoteJson = $state('');
  let currentNote: NDKEvent | null = $state(null);
  let currentUserPubkey = $state(''); // Will store the logged-in user's pubkey
  let broadcastStatus = $state(''); // For showing broadcast status
  
  // Track which notes are expanded
  let expandedNotes = $state(new Set<string>());
  
  // Toggle expanded state for a note
  function toggleExpanded(noteId: string): void {
    if (expandedNotes.has(noteId)) {
      expandedNotes.delete(noteId);
    } else {
      expandedNotes.add(noteId);
    }
    expandedNotes = new Set(expandedNotes); // Trigger reactivity
  }
  
  // Check if a note is expanded
  function isExpanded(noteId: string): boolean {
    return expandedNotes.has(noteId);
  }
  
  // Store for user profiles and event content
  let profileCache = $state(new Map<string, ProfileData>());
  let eventCache = $state(new Map<string, NDKEvent>());
  
  // Handle view details for a note
  function handleViewDetails(note: NDKEvent): void {
    currentNote = note;
    
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
  }
  
  // Handle delete event
  async function handleDeleteEvent(event: NDKEvent): Promise<void> {
    await deleteEvent($ndkInstance, event, async () => {
      // Close the modal
      jsonModalOpen = false;
      
      // Refresh the feed
      await loadData();
    });
  }
  
  // Handle broadcast event
  async function handleBroadcastEvent(event: NDKEvent): Promise<void> {
    await broadcastEvent($ndkInstance, event, relayUrl, (status) => {
      broadcastStatus = status;
    });
  }
  
  // Main function to load notes and related data
  async function loadData() {
    await loadNostrFeedData(
      $ndkInstance,
      pubkey,
      relayUrl,
      limit,
      disableFallback,
      profileCache,
      eventCache,
      (isLoading) => { loading = isLoading; },
      (errorMsg) => { error = errorMsg; },
      (loadedNotes) => { notes = loadedNotes; }
    );
  }

  onMount(() => {
    // Get the current user's pubkey if they're logged in
    if ($ndkInstance && $ndkInstance.signer) {
      try {
        $ndkInstance.signer.user().then(user => {
          if (user && user.npub) {
            const pubkey = extractPubkeyFromNpub(user.npub);
            if (pubkey) {
              currentUserPubkey = pubkey;
              console.log('Current user pubkey:', currentUserPubkey);
            }
          }
        }).catch(error => {
          console.error('Error getting current user:', error);
        });
      } catch (error) {
        console.error('Error getting current user:', error);
      }
    }
    
    // Set up event listener for viewEventDetails events
    const cleanup = setupEventDetailsListener(handleViewDetails);
    
    // Load data
    loadData();
    
    // Return cleanup function
    return cleanup;
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
      <NostrEventCard 
        note={note}
        eventCache={eventCache}
        profileCache={profileCache}
        disableFallback={disableFallback}
        relayUrl={relayUrl}
        isExpanded={isExpanded(note.id)}
        onToggleExpand={toggleExpanded}
        onViewDetails={handleViewDetails}
      />
    {/each}
  {/if}
</div>

<!-- Event Details Modal -->
<EventDetailsModal 
  bind:open={jsonModalOpen}
  currentNote={currentNote}
  currentNoteJson={currentNoteJson}
  relayUrl={relayUrl}
  disableFallback={disableFallback}
  currentUserPubkey={currentUserPubkey}
  broadcastStatus={broadcastStatus}
  profileCache={profileCache}
  deleteEvent={handleDeleteEvent}
  broadcastEvent={handleBroadcastEvent}
/>
