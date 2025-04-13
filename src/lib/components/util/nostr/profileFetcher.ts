import type { ProfileData } from './types';
import { parseContent, extractPubkeyFromNprofile, extractPubkeyFromNpub } from './utils';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Function to fetch a single profile by pubkey
export async function fetchProfile(
  ndkInstance: any,
  pubkey: string,
  profileCache: Map<string, ProfileData>
): Promise<Map<string, ProfileData>> {
  try {
    console.log(`Fetching profile for pubkey: ${pubkey}`);
    const user = ndkInstance.getUser({ pubkey });
    const profile = await user.fetchProfile();
    
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
  profileCache: Map<string, ProfileData>
): Promise<Map<string, ProfileData>> {
  console.log(`Batch fetching profiles for ${pubkeys.length} pubkeys`);
  
  let updatedProfileCache = new Map(profileCache);
  
  for (const pubkey of pubkeys) {
    if (!updatedProfileCache.has(pubkey)) {
      updatedProfileCache = await fetchProfile(ndkInstance, pubkey, updatedProfileCache);
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
