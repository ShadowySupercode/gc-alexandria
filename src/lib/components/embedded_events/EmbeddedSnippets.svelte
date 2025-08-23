<script module lang="ts">
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { NDKRelaySetFromNDK, toNpub, getUserMetadata } from "$lib/utils/nostrUtils";
  import { get } from "svelte/store";
  import { searchRelays } from "$lib/consts";
  import { userStore, type UserState } from "$lib/stores/userStore";
  import { buildCompleteRelaySet } from "$lib/utils/relay_management";
  import { nip19 } from "nostr-tools";
  import { parseEmbeddedMarkup } from "$lib/utils/markup/embeddedMarkupParser";
    import type NDK from "@nostr-dev-kit/ndk";

  export {
    parsedContent,
    repostContent,
    quotedContent,
    truncateContent,
    truncateRenderedContent,
    getNotificationType,
    fetchAuthorProfiles
  };

  /**
   * Truncates content to a specified length
   */
  function truncateContent(content: string, maxLength: number = 300): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  }

  /**
   * Truncates rendered HTML content while preserving quote boxes
   */
  function truncateRenderedContent(renderedHtml: string, maxLength: number = 300): string {
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
   * Gets notification type based on event kind
   */
  function getNotificationType(event: NDKEvent): string {
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
  async function fetchAuthorProfiles(events: NDKEvent[], ndk: NDK): Promise<Map<string, { name?: string; displayName?: string; picture?: string }>> {
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
        let profile = await getUserMetadata(npub, ndk, false);
        if (profile && (profile.name || profile.displayName || profile.picture)) {
          authorProfiles.set(pubkey, profile);
          return;
        }

        // Try search relays
        for (const relay of searchRelays) {
          try {
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
          if (!ndk) return;

          const userStoreValue: UserState = get(userStore);
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
        console.warn(`[fetchAuthorProfiles] Error processing profile for ${pubkey}:`, error);
      }
    });

    await Promise.all(profilePromises);
    return authorProfiles;
  }

  async function findQuotedMessage(eventId: string, publicMessages: NDKEvent[], ndk: NDK): Promise<NDKEvent | undefined> {
    // Validate eventId format (should be 64 character hex string)
    const isValidEventId = /^[a-fA-F0-9]{64}$/.test(eventId);
    if (!isValidEventId) return undefined;
    
    // First try to find in local messages
    let quotedMessage = publicMessages.find(msg => msg.id === eventId);
    
    // If not found locally, fetch from relays
    if (!quotedMessage) {
      try {
        if (ndk) {
          const userStoreValue: UserState = get(userStore);
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
        console.warn(`[findQuotedMessage] Failed to fetch quoted event ${eventId}:`, error);
      }
    }
    return quotedMessage;
  }
</script>

{#snippet parsedContent(content: string)}
  {#await parseEmbeddedMarkup(content, 0) then parsed}
    {@html parsed}
  {/await}
{/snippet}

{#snippet repostContent(content: string)}
  {@const originalEvent = (() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  })()}

  {#if originalEvent}
    {@const originalContent = originalEvent.content || ""}
    {@const originalAuthor = originalEvent.pubkey || ""}
    {@const originalCreatedAt = originalEvent.created_at || 0}
    {@const originalKind = originalEvent.kind || 1}
    {@const formattedDate = originalCreatedAt ? new Date(originalCreatedAt * 1000).toLocaleDateString() : "Unknown date"}
    {@const shortAuthor = originalAuthor ? `${originalAuthor.slice(0, 8)}...${originalAuthor.slice(-4)}` : "Unknown"}

    <div class="embedded-repost bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 my-2">
      <!-- Event header -->
      <div class="flex items-center justify-between mb-3 min-w-0">
        <div class="flex items-center space-x-2 min-w-0">
          <span class="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
            Kind {originalKind}
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
            (repost)
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">•</span>
          <span class="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">Author:</span>
          <span class="text-xs text-gray-700 dark:text-gray-300 font-mono">
            {shortAuthor}
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">•</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {formattedDate}
          </span>
        </div>
      </div>
      
      <!-- Reposted content -->
      <div class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
        {#await parseEmbeddedMarkup(originalContent, 0) then parsedOriginalContent}
          {@html parsedOriginalContent}
        {/await}
      </div>
    </div>
  {:else}
    {#await parseEmbeddedMarkup(content, 0) then parsedContent}
      {@html parsedContent}
    {/await}
  {/if}
{/snippet}

{#snippet quotedContent(message: NDKEvent, publicMessages: NDKEvent[], ndk: NDK)}
  {@const qTags = message.getMatchingTags("q")}
  {#if qTags.length > 0}
    {@const qTag = qTags[0]}
    {@const eventId = qTag[1]}
    
    {#if eventId}
      {#await findQuotedMessage(eventId, publicMessages, ndk) then quotedMessage}
        {#if quotedMessage}
          {@const quotedContent = quotedMessage.content ? quotedMessage.content.slice(0, 200) : "No content"}
          {#await parseEmbeddedMarkup(quotedContent, 0) then parsedContent}
            <div 
              class="block w-fit my-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 border-l-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm text-gray-600 dark:text-gray-300" 
              onclick={() => window.dispatchEvent(new CustomEvent('jump-to-message', { detail: eventId }))} 
              role="button" 
              tabindex="0" 
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent('jump-to-message', { detail: eventId }));
                }
              }}
            >
              {@html parsedContent}
            </div>
          {/await}
        {:else}
          {@const isValidEventId = /^[a-fA-F0-9]{64}$/.test(eventId)}
          {#if isValidEventId}
            {@const nevent = (() => {
              try {
                return nip19.neventEncode({ id: eventId });
              } catch (error) {
                console.warn(`[quotedContent] Failed to encode nevent for ${eventId}:`, error);
                return null;
              }
            })()}
            {#if nevent}
              <div 
                class="block w-fit my-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 border-l-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm text-gray-600 dark:text-gray-300" 
                onclick={() => window.location.href=`/events?id=${nevent}`} 
                role="button" 
                tabindex="0" 
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.location.href = `/events?id=${nevent}`;
                  }
                }}
              >
                Quoted message not found. Click to view event {eventId.slice(0, 8)}...
              </div>
            {:else}
              <div class="block w-fit my-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 border-l-2 border-gray-400 dark:border-gray-500 rounded text-sm text-gray-600 dark:text-gray-300">
                Quoted message not found. Event ID: {eventId.slice(0, 8)}...
              </div>
            {/if}
          {:else}
            <div class="block w-fit my-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 border-l-2 border-gray-400 dark:border-gray-500 rounded text-sm text-gray-600 dark:text-gray-300">
              Invalid quoted message reference
            </div>
          {/if}
        {/if}
      {/await}
    {/if}
  {/if}
{/snippet}
