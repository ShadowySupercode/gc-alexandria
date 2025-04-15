import { NDKRelaySet, type NDKEvent } from '@nostr-dev-kit/ndk';
import { decodeNevent } from './utils';
import { standardRelays } from '$lib/consts';
import type { ProfileData } from './types';

// Function to create a relay set with all available relays
export function createRelaySet(ndkInstance: any, relayUrl: string, useSingleRelayOnly: boolean = false) {
  const relaysToTry = new Set<string>();
  
  // Add the current relay
  relaysToTry.add(relayUrl);
  
  // If useSingleRelayOnly is true, only use the specified relay
  if (!useSingleRelayOnly) {
    // Add the standard Alexandria relays
    standardRelays.forEach(relay => relaysToTry.add(relay));
  }
  
  // Convert to array and create relay set
  const relayUrls = Array.from(relaysToTry);
  console.log(`Creating relay set with ${relayUrls.length} relays:`, relayUrls);
  return NDKRelaySet.fromRelayUrls(relayUrls, ndkInstance);
}

// Function to get a user's preferred relays
export async function getUserInboxRelays(ndkInstance: any, pubkey: string): Promise<string[]> {
  try {
    console.log(`Getting preferred relays for user: ${pubkey}`);
    const user = ndkInstance.getUser({ pubkey });
    
    // Try to get the user's NIP-65 relay list
    const relayList = await ndkInstance.fetchEvent(
      {
        kinds: [10002],
        authors: [pubkey],
      },
      { 
        groupable: false,
        skipVerification: false,
        skipValidation: false,
      }
    );
    
    const inboxRelays: string[] = [];
    
    if (relayList) {
      relayList.tags.forEach((tag: string[]) => {
        if (tag[0] === 'r' || tag[0] === 'read') {
          inboxRelays.push(tag[1]);
        }
      });
    }
    
    // If no relays were found, add some default relays
    if (inboxRelays.length === 0) {
      console.log(`No inbox relays found for user ${pubkey}, using default relays`);
      // Add some popular relays as fallbacks
      inboxRelays.push("wss://relay.damus.io");
      inboxRelays.push("wss://relay.nostr.band");
      inboxRelays.push("wss://nos.lol");
    }
    
    console.log(`Found ${inboxRelays.length} inbox relays for user ${pubkey}:`, inboxRelays);
    return inboxRelays;
  } catch (e) {
    console.error(`Failed to get preferred relays for user ${pubkey}:`, e);
    // Return some default relays in case of error
    return ["wss://relay.damus.io", "wss://relay.nostr.band", "wss://nos.lol"];
  }
}

// Function to fetch a single event directly from the relay
export async function fetchSingleEvent(
  ndkInstance: any, 
  nevent: string, 
  relayUrl: string,
  useSingleRelayOnly: boolean = false,
  authorPubkey?: string // The pubkey of the author who embedded this event
): Promise<NDKEvent> { // Updated return type since we always throw an error if no event is found
  try {
    // Decode the nevent to get the event ID and suggested relays
    const { eventId, suggestedRelays } = decodeNevent(nevent);
    
    if (!eventId) {
      console.error(`Failed to decode event ID from nevent: ${nevent}`);
      throw new Error(`Failed to decode event ID from nevent: ${nevent}`);
    }
    
    // Create a relay set with the primary relay
    let relaySet = createRelaySet(ndkInstance, relayUrl, useSingleRelayOnly);
    
    // If not using single relay only, add fallback relays
    if (!useSingleRelayOnly) {
      const allRelayUrls = new Set<string>();
      
      // Add existing relays
      relaySet.relays.forEach(relay => {
        if (relay.url) allRelayUrls.add(relay.url);
      });
      
      // Add suggested relays from the nevent
      if (suggestedRelays.length > 0) {
        suggestedRelays.forEach(relay => allRelayUrls.add(relay));
      }
      
      // If we have the author's pubkey, try to get their preferred relays
      if (authorPubkey) {
        const authorInboxRelays = await getUserInboxRelays(ndkInstance, authorPubkey);
        authorInboxRelays.forEach(relay => allRelayUrls.add(relay));
      }
      
      // Create a new relay set with all relays
      relaySet = NDKRelaySet.fromRelayUrls(Array.from(allRelayUrls), ndkInstance);
    }
    
    console.log(`Fetching event with ID: ${eventId}`);
    
    // Directly fetch the event using the event ID
    // The fetchEvent method returns NDKEvent | null, but we need NDKEvent | undefined
    const event = await ndkInstance.fetchEvent(
      eventId,
      {
        skipVerification: false,
        skipValidation: false
      },
      relaySet
    ) as NDKEvent; // Cast to NDKEvent to fix type error
    
    if (event) {
      console.log(`Successfully fetched event for ${nevent}:`);
      console.log('Event object:', JSON.stringify(event, null, 2));
      console.log('Event ID:', event.id);
      console.log('Event pubkey:', event.pubkey);
      console.log('Event content:', event.content);
      console.log('Event created_at:', event.created_at);
      console.log('Event kind:', event.kind);
      return event;
    } else {
      const errorMessage = `No event found for nevent: ${nevent}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  } catch (e) {
    console.error(`Failed to fetch event for ${nevent}:`, e);
    throw e; // Re-throw the error to be consistent with our error handling
  }
}

// Function to fetch multiple events
export async function fetchEvents(
  ndkInstance: any,
  neventIds: string[],
  relayUrl: string,
  eventCache: Map<string, NDKEvent>,
  profileCache: Map<string, ProfileData>,
  fetchProfile: (pubkey: string) => Promise<void>,
  useSingleRelayOnly: boolean = false,
  authorPubkey?: string // The pubkey of the author who embedded these events
): Promise<Map<string, NDKEvent>> {
  if (neventIds.length === 0) return eventCache;
  
  console.log(`Fetching ${neventIds.length} events`);
  
  // Create a new Map to avoid mutating the original
  const updatedEventCache = new Map(eventCache);
  
  // Process events in batches to avoid overwhelming the relays
  const batchSize = 5;
  const batches = [];
  
  // Split neventIds into batches
  for (let i = 0; i < neventIds.length; i += batchSize) {
    batches.push(neventIds.slice(i, i + batchSize));
  }
  
  console.log(`Split ${neventIds.length} events into ${batches.length} batches of up to ${batchSize} events each`);
  
  // Process each batch sequentially
  for (const batch of batches) {
    const batchPromises = batch.map(async (nevent) => {
      if (!updatedEventCache.has(nevent)) {
        try {
          const event = await fetchSingleEvent(ndkInstance, nevent, relayUrl, useSingleRelayOnly, authorPubkey);
          if (event) {
            // Return the event to be added to the cache later
            return { nevent, event };
          }
        } catch (error) {
          console.error(`Error fetching event ${nevent}:`, error);
          // Return null to indicate this event couldn't be fetched
          return { nevent, event: null };
        }
      }
      // Return null for events that are already in the cache
      return { nevent, event: null };
    });
    
    // Wait for all events in this batch to be fetched
    const batchResults = await Promise.all(batchPromises);
    
    // Add the fetched events to the cache and fetch profiles for their authors
    for (const { nevent, event } of batchResults) {
      if (event) {
        updatedEventCache.set(nevent, event);
        
        // Fetch profile for the event author
        if (event.pubkey && !profileCache.has(event.pubkey)) {
          try {
            await fetchProfile(event.pubkey);
          } catch (error) {
            console.error(`Error fetching profile for ${event.pubkey}:`, error);
            // Continue even if profile fetching fails
          }
        }
      }
    }
  }
  
  return updatedEventCache;
}

// Function to fetch notes from an author
export async function fetchNotes(
  ndkInstance: any,
  pubkey: string,
  relayUrl: string,
  limit: number,
  useSingleRelayOnly: boolean = false
): Promise<NDKEvent[]> {
  try {
    console.log(`fetchNotes: Creating relay set with relay URL: ${relayUrl}`);
    const relaySet = createRelaySet(ndkInstance, relayUrl, useSingleRelayOnly);
    console.log(`fetchNotes: Relay set created with ${relaySet.relays.size} relays`);
    
    // Check if the relay is connected
    let isConnected = false;
    for (const relay of relaySet.relays) {
      if (relay.status === 1) { // 1 means connected
        isConnected = true;
        console.log(`fetchNotes: Relay ${relay.url} is connected`);
      } else {
        console.log(`fetchNotes: Relay ${relay.url} is not connected, status: ${relay.status}`);
        
        // Try to connect to the relay
        try {
          console.log(`fetchNotes: Attempting to connect to relay ${relay.url}`);
          await relay.connect();
          console.log(`fetchNotes: Successfully connected to relay ${relay.url}`);
          isConnected = true;
        } catch (e) {
          console.error(`fetchNotes: Failed to connect to relay ${relay.url}:`, e);
        }
      }
    }
    
    if (!isConnected) {
      console.warn(`fetchNotes: No relays are connected! This might be the issue.`);
      
      // Try to connect to the relays again
      for (const relay of relaySet.relays) {
        try {
          console.log(`fetchNotes: Attempting to connect to relay ${relay.url} again`);
          await relay.connect();
          console.log(`fetchNotes: Successfully connected to relay ${relay.url}`);
          isConnected = true;
        } catch (e) {
          console.error(`fetchNotes: Failed to connect to relay ${relay.url} again:`, e);
        }
      }
      
      if (!isConnected) {
        console.error(`fetchNotes: Failed to connect to any relays, returning empty array`);
        return [];
      }
    }
    
    console.log(`fetchNotes: Fetching events for pubkey: ${pubkey}, limit: ${limit}`);
    
    // Fetch events from the specified author
    const eventSet = await ndkInstance.fetchEvents(
      {
        kinds: [1, 6, 20, 21, 22, 9802, 1621, 31922, 31923, 30023, 1111, 1621], // Include additional kinds: 20, 30023, 1111, 1621
        authors: [pubkey],
        limit: limit,
      },
      {
        groupable: false,
        skipVerification: false,
        skipValidation: false,
      },
      relaySet
    );
    
    console.log(`fetchNotes: Fetched event set with size: ${eventSet ? eventSet.size : 0}`);
    
    if (!eventSet || eventSet.size === 0) {
      console.log(`fetchNotes: No events found for pubkey: ${pubkey}`);
      return [];
    }
    
    // Convert to array and sort by created_at (newest first)
    let eventArray = Array.from(eventSet) as NDKEvent[];
    console.log(`fetchNotes: Converted event set to array with length: ${eventArray.length}`);
    
    eventArray.sort((a: NDKEvent, b: NDKEvent) => (b.created_at || 0) - (a.created_at || 0));
    console.log(`fetchNotes: Sorted events by created_at`);
    
    // Limit to the requested number of notes
    const result = eventArray.slice(0, limit);
    console.log(`fetchNotes: Returning ${result.length} events`);
    
    return result;
  } catch (e) {
    console.error('Error fetching notes:', e);
    throw e;
  }
}
