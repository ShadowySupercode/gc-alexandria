<script module lang="ts">
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { NDKRelaySetFromNDK, toNpub, getUserMetadata } from "$lib/utils/nostrUtils";
  import { get } from "svelte/store";
  import { searchRelays } from "$lib/consts";
  import { userStore, type UserState } from "$lib/stores/userStore";
  import { buildCompleteRelaySet } from "$lib/utils/relay_management";
  import { nip19 } from "nostr-tools";
  import { parseEmbeddedMarkup } from "$lib/utils/markup/embeddedMarkupParser";
  import { parseProfileContent, shortenNpub } from "$lib/utils/profile_parsing";
  import type NDK from "@nostr-dev-kit/ndk";

  export {
    repostContent,
    quotedContent,
    getNotificationType
  };

  
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
    {@const shortAuthor = originalAuthor ? shortenNpub(originalAuthor) : "Unknown"}

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
          {#await parseEmbeddedMarkup(quotedContent, 0, ndk) then parsedContent}
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
