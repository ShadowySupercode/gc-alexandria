import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
import type { NDKEvent } from "$lib/utils/nostrUtils";
import { getUserMetadata, NDKRelaySetFromNDK, toNpub } from "$lib/utils/nostrUtils";
import { get } from "svelte/store";
import { ndkInstance } from "$lib/ndk";
import { searchRelays } from "$lib/consts";
import { userStore } from "$lib/stores/userStore";
import { buildCompleteRelaySet } from "$lib/utils/relay_management";
import { neventEncode } from "$lib/utils";

// AI-NOTE: Notification-specific utility functions that don't exist elsewhere

/**
 * Truncates content to a specified length
 */
export function truncateContent(content: string, maxLength: number = 300): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}

/**
 * Truncates rendered HTML content while preserving quote boxes
 */
export function truncateRenderedContent(renderedHtml: string, maxLength: number = 300): string {
  if (renderedHtml.length <= maxLength) return renderedHtml;
  
  const hasQuoteBoxes = renderedHtml.includes('jump-to-message');
  
  if (hasQuoteBoxes) {
    const quoteBoxPattern = /<div class="block w-fit my-2 px-3 py-2 bg-gray-200[^>]*onclick="window\.dispatchEvent\(new CustomEvent\('jump-to-message'[^>]*>[^<]*<\/div>/g;
    const quoteBoxes = renderedHtml.match(quoteBoxPattern) || [];
    
    let textOnly = renderedHtml.replace(quoteBoxPattern, '|||QUOTEBOX|||');
    
    if (textOnly.length > maxLength) {
      const availableLength = maxLength - (quoteBoxes.join('').length);
      if (availableLength > 50) {
        textOnly = textOnly.slice(0, availableLength) + "...";
      } else {
        textOnly = textOnly.slice(0, 50) + "...";
      }
    }
    
    let result = textOnly;
    quoteBoxes.forEach(box => {
      result = result.replace('|||QUOTEBOX|||', box);
    });
    
    return result;
  } else {
    if (renderedHtml.includes('<')) {
      const truncated = renderedHtml.slice(0, maxLength);
      const lastTagStart = truncated.lastIndexOf('<');
      const lastTagEnd = truncated.lastIndexOf('>');
      
      if (lastTagStart > lastTagEnd) {
        return renderedHtml.slice(0, lastTagStart) + "...";
      }
      return truncated + "...";
    } else {
      return renderedHtml.slice(0, maxLength) + "...";
    }
  }
}

/**
 * Parses content using basic markup parser
 */
export async function parseContent(content: string): Promise<string> {
  if (!content) return "";
  return await parseBasicmarkup(content);
}

/**
 * Renders quoted content for a message
 */
export async function renderQuotedContent(message: NDKEvent, publicMessages: NDKEvent[]): Promise<string> {
  const qTags = message.getMatchingTags("q");
  if (qTags.length === 0) return "";
  
  const qTag = qTags[0];
  const eventId = qTag[1];
  
  if (eventId) {
    // First try to find in local messages
    let quotedMessage = publicMessages.find(msg => msg.id === eventId);
    
    // If not found locally, fetch from relays
    if (!quotedMessage) {
      try {
        const ndk = get(ndkInstance);
        if (ndk) {
          const userStoreValue = get(userStore);
                      const user = userStoreValue.signedIn && userStoreValue.pubkey ? ndk.getUser({ pubkey: userStoreValue.pubkey }) : null;
            const relaySet = await buildCompleteRelaySet(ndk, user);
            const allRelays = [...relaySet.inboxRelays, ...relaySet.outboxRelays, ...searchRelays];
          
          if (allRelays.length > 0) {
            const ndkRelaySet = NDKRelaySetFromNDK.fromRelayUrls(allRelays, ndk);
            const fetchedEvent = await ndk.fetchEvent({ ids: [eventId], limit: 1 }, undefined, ndkRelaySet);
            quotedMessage = fetchedEvent || undefined;
          }
        }
      } catch (error) {
        console.warn(`[renderQuotedContent] Failed to fetch quoted event ${eventId}:`, error);
      }
    }
    
    if (quotedMessage) {
      const quotedContent = quotedMessage.content ? quotedMessage.content.slice(0, 200) : "No content";
      const parsedContent = await parseBasicmarkup(quotedContent);
      return `<div class="block w-fit my-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 border-l-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm text-gray-600 dark:text-gray-300" onclick="window.dispatchEvent(new CustomEvent('jump-to-message', { detail: '${eventId}' }))">${parsedContent}</div>`;
    } else {
      // Fallback to nevent link
      const nevent = neventEncode({ id: eventId } as any, []);
      return `<div class="block w-fit my-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 border-l-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm text-gray-600 dark:text-gray-300" onclick="window.location.href='/events?id=${nevent}'">Quoted message not found. Click to view event ${eventId.slice(0, 8)}...</div>`;
    }
  }
  
  return ""; 
}

/**
 * Gets notification type based on event kind
 */
export function getNotificationType(event: NDKEvent): string {
  switch (event.kind) {
    case 1: return "Reply";
    case 1111: return "Custom Reply";
    case 9802: return "Highlight";
    case 6: return "Repost";
    case 16: return "Generic Repost";
    case 24: return "Public Message";
    default: return `Kind ${event.kind}`;
  }
}

/**
 * Fetches author profiles for a list of events
 */
export async function fetchAuthorProfiles(events: NDKEvent[]): Promise<Map<string, { name?: string; displayName?: string; picture?: string }>> {
  const authorProfiles = new Map<string, { name?: string; displayName?: string; picture?: string }>();
  const uniquePubkeys = new Set<string>();
  
  events.forEach(event => {
    if (event.pubkey) uniquePubkeys.add(event.pubkey);
  });

  const profilePromises = Array.from(uniquePubkeys).map(async (pubkey) => {
    try {
      const npub = toNpub(pubkey);
      if (!npub) return;

      // Try cache first
      let profile = await getUserMetadata(npub, false);
      if (profile && (profile.name || profile.displayName || profile.picture)) {
        authorProfiles.set(pubkey, profile);
        return;
      }

      // Try search relays
      for (const relay of searchRelays) {
        try {
          const ndk = get(ndkInstance);
          if (!ndk) break;

          const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
          const profileEvent = await ndk.fetchEvent(
            { kinds: [0], authors: [pubkey] },
            undefined,
            relaySet
          );

          if (profileEvent) {
            const profileData = JSON.parse(profileEvent.content);
            authorProfiles.set(pubkey, {
              name: profileData.name,
              displayName: profileData.display_name || profileData.displayName,
              picture: profileData.picture || profileData.image
            });
            return;
          }
        } catch (error) {
          console.warn(`[fetchAuthorProfiles] Failed to fetch profile from ${relay}:`, error);
        }
      }

      // Try all available relays as fallback
      try {
        const ndk = get(ndkInstance);
        if (!ndk) return;

        const userStoreValue = get(userStore);
        const user = userStoreValue.signedIn && userStoreValue.pubkey ? ndk.getUser({ pubkey: userStoreValue.pubkey }) : null;
        const relaySet = await buildCompleteRelaySet(ndk, user);
        const allRelays = [...relaySet.inboxRelays, ...relaySet.outboxRelays];
        
        if (allRelays.length > 0) {
          const ndkRelaySet = NDKRelaySetFromNDK.fromRelayUrls(allRelays, ndk);
          const profileEvent = await ndk.fetchEvent(
            { kinds: [0], authors: [pubkey] },
            undefined,
            ndkRelaySet
          );

          if (profileEvent) {
            const profileData = JSON.parse(profileEvent.content);
            authorProfiles.set(pubkey, {
              name: profileData.name,
              displayName: profileData.display_name || profileData.displayName,
              picture: profileData.picture || profileData.image
            });
          }
        }
      } catch (error) {
        console.warn(`[fetchAuthorProfiles] Failed to fetch profile from all relays:`, error);
      }
    } catch (error) {
      console.warn(`[fetchAuthorProfiles] Failed to fetch profile for ${pubkey}:`, error);
    }
  });

  await Promise.allSettled(profilePromises);
  return authorProfiles;
}
