import type { ProfileData } from './types';
import { parseContent, extractPubkeyFromNprofile, extractPubkeyFromNpub } from './utils';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Function to fetch a single profile by pubkey
export async function fetchProfile(
  ndkInstance: any,
  pubkey: string,
  profileCache: Map<string, ProfileData>,
  useSingleRelayOnly: boolean = false,
  relayUrl?: string
): Promise<Map<string, ProfileData>> {
  try {
    console.log(`Fetching profile for pubkey: ${pubkey}`);
    const user = ndkInstance.getUser({ pubkey });
    
    let profile;
    if (useSingleRelayOnly && relayUrl) {
      // If we're using a single relay only, create a relay set with just that relay
      const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
      const relaySet = NDKRelaySet.fromRelayUrls([relayUrl], ndkInstance);
      profile = await user.fetchProfile({ relaySet });
    } else {
      // Otherwise use the default behavior
      profile = await user.fetchProfile();
    }
    
    // Create a new Map to avoid mutating the original
    const updatedProfileCache = new Map(profileCache);
    
    if (profile) {
      const profileData = {
        name: typeof profile.name === 'string' ? profile.name : String(profile.name || ''),
        displayName: typeof profile.displayName === 'string' ? profile.displayName : 
                    typeof profile.display_name === 'string' ? profile.display_name :
                    String(profile.displayName || profile.display_name || '')
      };
      
      updatedProfileCache.set(pubkey, profileData);
      console.log(`Added profile for pubkey ${pubkey}:`, profileData);
    } else {
      console.log(`No profile found for pubkey: ${pubkey}`);
    }
    
    return updatedProfileCache;
  } catch (e) {
    console.error(`Failed to fetch profile for ${pubkey}:`, e);
    return profileCache;
  }
}

// Function to fetch profiles for specific pubkeys
export async function fetchProfilesByPubkeys(
  ndkInstance: any,
  pubkeys: string[],
  profileCache: Map<string, ProfileData>,
  useSingleRelayOnly: boolean = false,
  relayUrl?: string
): Promise<Map<string, ProfileData>> {
  console.log(`Batch fetching profiles for ${pubkeys.length} pubkeys`);
  
  let updatedProfileCache = new Map(profileCache);
  
  // Process pubkeys in batches to avoid overwhelming the relays
  const batchSize = 5;
  const batches = [];
  
  // Split pubkeys into batches
  for (let i = 0; i < pubkeys.length; i += batchSize) {
    batches.push(pubkeys.slice(i, i + batchSize));
  }
  
  console.log(`Split ${pubkeys.length} pubkeys into ${batches.length} batches of up to ${batchSize} pubkeys each`);
  
  // Process each batch sequentially
  for (const batch of batches) {
    const batchPromises = batch.map(async (pubkey) => {
      if (!updatedProfileCache.has(pubkey)) {
        try {
          const result = await fetchProfile(ndkInstance, pubkey, updatedProfileCache, useSingleRelayOnly, relayUrl);
          // We don't update updatedProfileCache here because it would cause race conditions
          // Instead, we return the result to be merged later
          return { pubkey, result };
        } catch (e) {
          console.error(`Error fetching profile for ${pubkey}:`, e);
          return { pubkey, result: updatedProfileCache }; // Return the unchanged cache on error
        }
      }
      return { pubkey, result: updatedProfileCache }; // Return the unchanged cache if already cached
    });
    
    // Wait for all profiles in this batch to be fetched
    const batchResults = await Promise.all(batchPromises);
    
    // Merge the results into the cache
    for (const { pubkey, result } of batchResults) {
      // If the result has an entry for this pubkey, add it to our cache
      if (result.has(pubkey)) {
        updatedProfileCache.set(pubkey, result.get(pubkey)!);
      }
    }
  }
  
  return updatedProfileCache;
}

// Function to collect all referenced pubkeys and nevents from notes
export function collectReferencesFromNotes(
  notes: NDKEvent[]
): { pubkeys: Set<string>, nevents: Set<string> } {
  const allPubkeys = new Set<string>();
  const allNevents = new Set<string>();
  const nprofileMap = new Map<string, string>(); // Map nprofile -> pubkey
  
  console.log("Collecting references from notes...");
  
  // Collect all npubs, nprofiles, and nevents from notes content
  for (const note of notes) {
    const { npubs, nprofiles, nevents } = parseContent(note.content);
    
    // Convert npubs to hex pubkeys and add them
    npubs.forEach(npub => {
      const hexPubkey = extractPubkeyFromNpub(npub);
      if (hexPubkey) {
        allPubkeys.add(hexPubkey);
        console.log(`Converted npub ${npub} to hex pubkey ${hexPubkey}`);
      } else {
        console.error(`Failed to convert npub ${npub} to hex pubkey`);
      }
    });
    
    // Extract pubkeys from nprofiles and add them
    nprofiles.forEach(nprofile => {
      const pubkey = extractPubkeyFromNprofile(nprofile);
      if (pubkey) {
        allPubkeys.add(pubkey);
        nprofileMap.set(nprofile, pubkey);
        console.log(`Added mapping: nprofile ${nprofile} -> pubkey ${pubkey}`);
      }
    });
    
    // Add nevents
    nevents.forEach(nevent => allNevents.add(nevent));
    
    // Also add the note author's pubkey
    allPubkeys.add(note.pubkey);
    
    // For reposts, add the original author's pubkey and check for nevents in reposted content
    if (note.kind === 6) {
      try {
        // Kind 6 events store the reposted event in the content field as JSON
        const repostedEvent = JSON.parse(note.content);
        if (repostedEvent.pubkey) {
          allPubkeys.add(repostedEvent.pubkey);
        }
        
        // Check for nevents in reposted content
        if (repostedEvent.content) {
          const { nevents: repostedNevents } = parseContent(repostedEvent.content);
          repostedNevents.forEach(nevent => allNevents.add(nevent));
        }
      } catch (e) {
        console.error('Failed to parse reposted content:', e);
      }
    }
  }
  
  console.log(`Collected ${allPubkeys.size} pubkeys and ${allNevents.size} nevents from notes`);
  
  return { pubkeys: allPubkeys, nevents: allNevents };
}
