import { NDKRelaySet, type NDKEvent } from '@nostr-dev-kit/ndk';
import { decodeNevent } from './utils';
import { standardRelays } from '$lib/consts';
import type { ProfileData } from './types';

// Function to create a relay set with all available relays
export function createRelaySet(ndkInstance: any, relayUrl: string) {
  const relaysToTry = new Set<string>();
  
  // Add the current relay
  relaysToTry.add(relayUrl);
  
  // Add the standard Alexandria relays
  standardRelays.forEach(relay => relaysToTry.add(relay));
  
  // Add big popular relays
  const popularRelays = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
    "wss://nostr.wine",
    "wss://nostr.land",
    "wss://nostr.einundzwanzig.space",
    "wss://relay.primal.net",
    "wss://eden.nostr.land",
    "wss://purplepag.es",
    "wss://nostr21.com"
  ];
  
  popularRelays.forEach(relay => relaysToTry.add(relay));
  
  // Convert to array and create relay set
  const relayUrls = Array.from(relaysToTry);
  console.log(`Creating relay set with ${relayUrls.length} relays:`, relayUrls);
  return NDKRelaySet.fromRelayUrls(relayUrls, ndkInstance);
}

// Function to fetch a single event directly from the relay
export async function fetchSingleEvent(
  ndkInstance: any, 
  nevent: string, 
  relayUrl: string
): Promise<NDKEvent> { // Updated return type since we always throw an error if no event is found
  try {
    // Decode the nevent to get the event ID and suggested relays
    const { eventId, suggestedRelays } = decodeNevent(nevent);
    
    if (!eventId) {
      console.error(`Failed to decode event ID from nevent: ${nevent}`);
      throw new Error(`Failed to decode event ID from nevent: ${nevent}`);
    }
    
    // Create a relay set with all available relays
    let relaySet = createRelaySet(ndkInstance, relayUrl);
    
    // Add suggested relays if available
    if (suggestedRelays.length > 0) {
      const allRelayUrls = new Set<string>();
      
      // Add existing relays
      relaySet.relays.forEach(relay => {
        if (relay.url) allRelayUrls.add(relay.url);
      });
      
      // Add suggested relays
      suggestedRelays.forEach(relay => allRelayUrls.add(relay));
      
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
  fetchProfile: (pubkey: string) => Promise<void>
): Promise<Map<string, NDKEvent>> {
  if (neventIds.length === 0) return eventCache;
  
  console.log(`Fetching ${neventIds.length} events`);
  
  // Create a new Map to avoid mutating the original
  const updatedEventCache = new Map(eventCache);
  
  // Fetch each event individually
  for (const nevent of neventIds) {
    if (!updatedEventCache.has(nevent)) {
      try {
        const event = await fetchSingleEvent(ndkInstance, nevent, relayUrl);
        if (event) {
          updatedEventCache.set(nevent, event);
          
          // Fetch profile for the event author
          if (event.pubkey && !profileCache.has(event.pubkey)) {
            await fetchProfile(event.pubkey);
          }
        }
      } catch (error) {
        console.error(`Error fetching event ${nevent}:`, error);
        // Continue to the next event even if this one fails
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
  limit: number
): Promise<NDKEvent[]> {
  try {
    console.log(`fetchNotes: Creating relay set with relay URL: ${relayUrl}`);
    const relaySet = createRelaySet(ndkInstance, relayUrl);
    console.log(`fetchNotes: Relay set created with ${relaySet.relays.size} relays`);
    
    // Check if the relay is connected
    let isConnected = false;
    for (const relay of relaySet.relays) {
      if (relay.status === 1) { // 1 means connected
        isConnected = true;
        console.log(`fetchNotes: Relay ${relay.url} is connected`);
      } else {
        console.log(`fetchNotes: Relay ${relay.url} is not connected, status: ${relay.status}`);
      }
    }
    
    if (!isConnected) {
      console.warn(`fetchNotes: No relays are connected! This might be the issue.`);
    }
    
    console.log(`fetchNotes: Fetching events for pubkey: ${pubkey}, limit: ${limit}`);
    
    // Fetch events from the specified author
    const eventSet = await ndkInstance.fetchEvents(
      {
        kinds: [1, 6], // kind 1 notes and kind 6 reposts
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
