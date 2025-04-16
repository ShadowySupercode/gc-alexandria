import { NDKEvent } from '@nostr-dev-kit/ndk';
import { standardRelays } from '$lib/consts';
import { fetchNotes, fetchEvents } from './eventFetcher';
import { fetchProfile, fetchProfilesByPubkeys, collectReferencesFromNotes } from './profileFetcher';
import type { ProfileData } from './types';

// Function to delete an event (create a kind 5 deletion event)
export async function deleteEvent(
  ndkInstance: any, 
  event: NDKEvent, 
  onSuccess?: () => Promise<void>
): Promise<void> {
  try {
    if (!ndkInstance) {
      console.error('NDK instance not available');
      return;
    }
    
    // Create a kind 5 deletion event
    const deletionEvent = new NDKEvent(ndkInstance);
    deletionEvent.kind = 5;
    deletionEvent.tags = [['e', event.id]];
    deletionEvent.content = 'Deleted via Alexandria';
    
    // Sign and publish the event
    await deletionEvent.sign();
    await deletionEvent.publish();
    
    // Call the success callback if provided
    if (onSuccess) {
      await onSuccess();
    }
  } catch (error) {
    console.error('Error deleting event:', error);
  }
}

// Function to broadcast an event to multiple relays
export async function broadcastEvent(
  ndkInstance: any, 
  event: NDKEvent, 
  relayUrl: string,
  onStatusChange?: (status: string) => void
): Promise<void> {
  try {
    if (!ndkInstance) {
      console.error('NDK instance not available');
      return;
    }
    
    if (onStatusChange) {
      onStatusChange('Broadcasting...');
    }
    
    // Create a relay set with standard relays
    const relaySet = new Set<string>(standardRelays);
    
    // Add the current relay if not already included
    relaySet.add(relayUrl);
    
    // Add NDK relays if available
    if (ndkInstance.pool?.relays) {
      // Convert Map to array and extract URLs
      const ndkRelays = Array.from(ndkInstance.pool.relays.values())
        .map((relay: any) => relay.url);
      
      // Add to our set
      ndkRelays.forEach((url: string) => {
        if (url) relaySet.add(url);
      });
    }
    
    // Create an array of relays
    const relays = Array.from(relaySet);
    
    // Publish the event to all relays
    await event.publish();
    
    if (onStatusChange) {
      onStatusChange(`Broadcast to ${relays.length} relays successful!`);
      
      // Reset status after 3 seconds
      setTimeout(() => {
        onStatusChange('');
      }, 3000);
    }
  } catch (error) {
    console.error('Error broadcasting event:', error);
    if (onStatusChange) {
      onStatusChange('Broadcast failed');
    }
  }
}

// Main function to load notes and related data
export async function loadNostrFeedData(
  ndkInstance: any,
  pubkey: string,
  relayUrl: string,
  limit: number = 10,
  disableFallback: boolean = false,
  profileCache: Map<string, ProfileData>,
  eventCache: Map<string, NDKEvent>,
  onLoadingChange?: (loading: boolean) => void,
  onErrorChange?: (error: string | null) => void,
  onNotesChange?: (notes: NDKEvent[]) => void
) {
  try {
    if (onLoadingChange) {
      onLoadingChange(true);
    }
    if (onErrorChange) {
      onErrorChange(null);
    }
    
    console.log(`Starting to fetch notes for pubkey: ${pubkey} from relay: ${relayUrl}`);
    
    let notes: NDKEvent[] = [];
    
    // Try to fetch notes from the specified relay
    try {
      notes = await fetchNotes(ndkInstance, pubkey, relayUrl, limit, disableFallback);
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
              notes = await fetchNotes(ndkInstance, pubkey, standardRelay, limit, false);
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
      if (onLoadingChange) {
        onLoadingChange(false);
      }
      if (onNotesChange) {
        onNotesChange([]);
      }
      return;
    }
    
    try {
      // Collect all referenced pubkeys and nevents
      const { pubkeys, nevents } = collectReferencesFromNotes(notes);
      
      // Fetch profiles for all pubkeys
      let updatedProfileCache = await fetchProfilesByPubkeys(
        ndkInstance, 
        Array.from(pubkeys), 
        profileCache,
        disableFallback,
        relayUrl
      );
      
      // Fetch content for all nevents
      let updatedEventCache = eventCache;
      if (nevents.size > 0) {
        updatedEventCache = await fetchEvents(
          ndkInstance,
          Array.from(nevents),
          relayUrl,
          eventCache,
          updatedProfileCache,
          async (pubkey: string) => {
            updatedProfileCache = await fetchProfile(ndkInstance, pubkey, updatedProfileCache, disableFallback, relayUrl);
          },
          disableFallback,
          pubkey // Pass the author's pubkey for fetching their preferred relays
        );
      }
      
      // Update the caches and notes
      if (onNotesChange) {
        onNotesChange(notes);
      }
    } catch (e) {
      console.error('Error processing notes:', e);
      // Even if there's an error processing notes, we still want to display the notes we have
      if (onNotesChange) {
        onNotesChange(notes);
      }
    }
    
  } catch (e) {
    console.error('Error loading data:', e);
    if (onErrorChange) {
      onErrorChange(`Failed to load data: ${e}`);
    }
  } finally {
    // Always set loading to false, even if there was an error
    if (onLoadingChange) {
      onLoadingChange(false);
    }
  }
}

// Function to setup event details listener
export function setupEventDetailsListener(
  onEventDetails: (event: NDKEvent) => void
): () => void {
  // Add event listener for viewEventDetails events
  const handler = (e: any) => {
    if (e.detail && e.detail.event) {
      onEventDetails(e.detail.event);
    }
  };
  
  document.addEventListener('viewEventDetails', handler);
  
  // Return a cleanup function to remove the event listener
  return () => {
    document.removeEventListener('viewEventDetails', handler);
  };
}
