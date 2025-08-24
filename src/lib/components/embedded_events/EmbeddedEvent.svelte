<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { fetchEventWithFallback, getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { parsedContent, repostContent, quotedContent } from "$lib/snippets/EmbeddedSnippets.svelte";
  import { naddrEncode } from "$lib/utils";
  import { activeInboxRelays, getNdkContext } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { getEventType } from "$lib/utils/mime";
  import { nip19 } from "nostr-tools";
  import { repostKinds } from "$lib/consts";
  import { UserOutline } from "flowbite-svelte-icons";
  import type { UserProfile } from "$lib/models/user_profile";
  
  const {
    nostrIdentifier,
    nestingLevel = 0,
  } = $props<{
    nostrIdentifier: string;
    nestingLevel?: number;
  }>();

  const ndk = getNdkContext();

  let event = $state<NDKEvent | null>(null);
  let profile = $state< UserProfile | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let authorDisplayName = $state<string | undefined>(undefined);

  // Maximum nesting level allowed
  const MAX_NESTING_LEVEL = 3;

  // AI-NOTE: 2025-01-24 - Embedded event component for rendering nested Nostr events
  // Supports up to 3 levels of nesting, after which it falls back to showing just the link
  // AI-NOTE: 2025-01-24 - Updated to handle both NIP-19 identifiers and raw event IDs
  // If a raw event ID is passed, it automatically creates a nevent identifier

  $effect(() => {
    if (nostrIdentifier) {
      loadEvent();
    }
  });

  async function loadEvent() {
    if (nestingLevel >= MAX_NESTING_LEVEL) {
      // At max nesting level, don't load the event, just show the link
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      if (!ndk) {
        throw new Error("No NDK instance available");
      }

      // Clean the identifier (remove nostr: prefix if present)
      const cleanId = nostrIdentifier.replace(/^nostr:/, "");

      // Try to decode as NIP-19 identifier first
      let decoded;
      try {
        decoded = nip19.decode(cleanId);
      } catch (decodeError) {
        // If decoding fails, assume it's a raw event ID and create a nevent
        if (/^[0-9a-fA-F]{64}$/.test(cleanId)) {
          // It's a valid hex event ID, create a nevent
          const nevent = nip19.neventEncode({
            id: cleanId,
            relays: [],
          });
          decoded = nip19.decode(nevent);
        } else {
          throw new Error(`Invalid identifier format: ${cleanId}`);
        }
      }

      if (!decoded) {
        throw new Error("Failed to decode Nostr identifier");
      }

      let eventId: string | undefined;
      if (decoded.type === "nevent") {
        eventId = decoded.data.id;
      } else if (decoded.type === "naddr") {
        // For naddr, we need to construct a filter
        const naddrData = decoded.data as any;
        const filter = {
          kinds: [naddrData.kind || 0],
          authors: [naddrData.pubkey],
          "#d": [naddrData.identifier],
        };
        const foundEvent = await fetchEventWithFallback(ndk, filter);
        if (!foundEvent) {
          throw new Error("Event not found");
        }
        event = foundEvent;
      } else if (decoded.type === "note") {
        // For note, treat it as a nevent
        eventId = (decoded.data as any).id;
      } else {
        throw new Error(`Unsupported identifier type: ${decoded.type}`);
      }

      // If we have an event ID, fetch the event
      if (eventId && !event) {
        event = await fetchEventWithFallback(ndk, eventId);
        if (!event) {
          throw new Error("Event not found");
        }
      }

      // Load profile for the event author
      if (event?.pubkey) {
        const npub = toNpub(event.pubkey);
        if (npub) {
          const userProfile = await getUserMetadata(npub, ndk);
          authorDisplayName =
            userProfile.displayName ||
            (userProfile as any).display_name ||
            userProfile.name ||
            event.pubkey;
        }
      }

      // Parse profile if it's a profile event
      if (event?.kind === 0) {
        try {
          profile = JSON.parse(event.content);
        } catch {
          profile = null;
        }
      }

    } catch (err) {
      console.error("Error loading embedded event:", err);
      error = err instanceof Error ? err.message : "Failed to load event";
    } finally {
      loading = false;
    }
  }

  function getEventTitle(event: NDKEvent): string {
    const titleTag = event.getMatchingTags("title")[0]?.[1];
    if (titleTag) return titleTag;
    
    // For profile events, use display name
    if (event.kind === 0 && profile) {
      return profile.display_name || profile.name || "Profile";
    }
    
    // For text events (kind 1), don't show a title if it would duplicate the content
    if (event.kind === 1) {
      return "";
    }
    
    // For other events, use first line of content, but filter out nostr identifiers
    if (event.content) {
      const firstLine = event.content.split("\n")[0].trim();
      if (firstLine) {
        // Remove nostr identifiers from the title
        const cleanTitle = firstLine.replace(/nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g, '').trim();
        if (cleanTitle) return cleanTitle.slice(0, 100);
      }
    }
    
    return "Untitled";
  }

  function getEventSummary(event: NDKEvent): string {
    if (event.kind === 0 && profile?.about) {
      return profile.about;
    }
    
    if (event.content) {
      const lines = event.content.split("\n");
      const summaryLines = lines.slice(1, 3).filter(line => line.trim());
      if (summaryLines.length > 0) {
        return summaryLines.join(" ").slice(0, 200);
      }
    }
    
    return "";
  }

  function navigateToEvent() {
    if (event) {
      goto(`/events?id=${nostrIdentifier}`);
    }
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  function isAddressableEvent(event: NDKEvent): boolean {
    return getEventType(event.kind || 0) === "addressable";
  }
</script>

{#if nestingLevel >= MAX_NESTING_LEVEL}
  <!-- At max nesting level, just show the link -->
  <div class="embedded-event-max-nesting min-w-0 overflow-hidden">
    <a 
      href="/events?id={nostrIdentifier}" 
      class="text-primary-600 dark:text-primary-500 hover:underline break-all"
      onclick={(e) => {
        e.preventDefault();
        goto(`/events?id=${nostrIdentifier}`);
      }}
    >
      {nostrIdentifier}
    </a>
  </div>
{:else if loading}
  <!-- Loading state -->
  <div class="embedded-event-loading bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 min-w-0 overflow-hidden">
    <div class="flex items-center space-x-2">
      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 flex-shrink-0"></div>
      <span class="text-sm text-gray-600 dark:text-gray-400">Loading event...</span>
    </div>
  </div>
{:else if error}
  <!-- Error state -->
  <div class="embedded-event-error bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800 min-w-0 overflow-hidden">
    <div class="flex items-center space-x-2">
      <span class="text-red-600 dark:text-red-400 text-sm flex-shrink-0">⚠️</span>
      <span class="text-sm text-red-600 dark:text-red-400">Failed to load event</span>
    </div>
    <a 
      href="/events?id={nostrIdentifier}" 
      class="text-primary-600 dark:text-primary-500 hover:underline text-sm mt-1 inline-block break-all"
      onclick={(e) => {
        e.preventDefault();
        goto(`/events?id=${nostrIdentifier}`);
      }}
    >
      View event directly
    </a>
  </div>
{:else if event}
  <!-- Event content -->
  <div class="embedded-event bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 mb-2 min-w-0 overflow-hidden">
    <!-- Event header -->
    <div class="flex items-center justify-between mb-3 min-w-0">
      <div class="flex items-center space-x-2 min-w-0">
        <span class="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
          Kind {event.kind}
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          ({getEventType(event.kind || 0)})
        </span>
        {#if event.pubkey}
          <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">•</span>
          <span class="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">Author:</span>
          <div class="min-w-0 flex-1">
            {#if toNpub(event.pubkey)}
              {@render userBadge(
                toNpub(event.pubkey) as string,
                authorDisplayName,
              )}
            {:else}
              <span class="text-xs text-gray-700 dark:text-gray-300 break-all">
                {authorDisplayName || event.pubkey.slice(0, 8)}...{event.pubkey.slice(-4)}
              </span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Event title -->
    {#if getEventTitle(event)}
      <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2 break-words">
        {getEventTitle(event)}
      </h4>
    {/if}

    <!-- Summary for non-content events -->
    {#if event.kind !== 1 && getEventSummary(event)}
      <div class="mb-2 min-w-0">
        <p class="text-sm text-gray-700 dark:text-gray-300 break-words">
          {getEventSummary(event)}
        </p>
      </div>
    {/if}

    <!-- Content for text events -->
    {#if event.kind === 1 || repostKinds.includes(event.kind)}
      <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
        {#if repostKinds.includes(event.kind)}
          <!-- Repost content - parse stringified JSON according to NIP-18 -->
          <div class="border-l-4 border-primary-300 dark:border-primary-600 pl-3 mb-2">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {event.kind === 6 ? 'Reposted content:' : 'Generic reposted content:'}
            </div>
            {@render repostContent(event.content)}
          </div>
        {:else if event.kind === 1 && event.getMatchingTags("q").length > 0}
          <!-- Quote repost content - kind 1 with q tag according to NIP-18 -->
          <div class="border-l-4 border-primary-300 dark:border-primary-600 pl-3 mb-2">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Quote repost:
            </div>
            {@render quotedContent(event, [], ndk)}
            {#if event.content && event.content.trim()}
              <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Added comment:
                </div>
                {@render parsedContent(event.content)}
              </div>
            {/if}
          </div>
        {:else}
          <!-- Regular text content -->
          {@render parsedContent(event.content.slice(0, 300))}
          {#if event.content.length > 300}
            <span class="text-gray-500 dark:text-gray-400">...</span>
          {/if}
        {/if}
      </div>
    <!-- Contact list content (kind 3) -->
    {:else if event.kind === 3}
      <div class="space-y-2 min-w-0 overflow-hidden">
        {#if event.content}
          {@const contactData = (() => {
            try {
              return JSON.parse(event.content);
            } catch {
              return null;
            }
          })()}
          {#if contactData}
            <div class="text-sm text-gray-700 dark:text-gray-300">
              <div class="mb-2">
                <span class="font-semibold">Contact List</span>
                {#if contactData.relays}
                  <div class="mt-1">
                    <span class="text-xs text-gray-500 dark:text-gray-400">Relays: {Object.keys(contactData.relays).length}</span>
                  </div>
                {/if}
              </div>
              {#if contactData.follows}
                <div class="mt-2">
                  <span class="text-xs text-gray-500 dark:text-gray-400">Following: {contactData.follows.length} users</span>
                </div>
              {/if}
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Invalid contact list data
            </div>
          {/if}
        {:else}
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Empty contact list
          </div>
        {/if}
      </div>
    <!-- Publication index content (kind 30040) -->
    {:else if event.kind === 30040}
      <div class="space-y-2 min-w-0 overflow-hidden">
        {#if event.content}
          {@const indexData = (() => {
            try {
              return JSON.parse(event.content);
            } catch {
              return null;
            }
          })()}
          {#if indexData}
            <div class="text-sm text-gray-700 dark:text-gray-300">
              <div class="mb-2">
                <span class="font-semibold">Publication Index</span>
                {#if indexData.title}
                  <div class="mt-1">
                    <span class="text-xs text-gray-500 dark:text-gray-400">Title: {indexData.title}</span>
                  </div>
                {/if}
                {#if indexData.summary}
                  <div class="mt-1">
                    <span class="text-xs text-gray-500 dark:text-gray-400">Summary: {indexData.summary}</span>
                  </div>
                {/if}
                {#if indexData.authors}
                  <div class="mt-1">
                    <span class="text-xs text-gray-500 dark:text-gray-400">Authors: {indexData.authors.length}</span>
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Invalid publication index data
            </div>
          {/if}
        {:else}
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Empty publication index
          </div>
        {/if}
      </div>
    <!-- Publication content (kinds 30041, 30818) -->
    {:else if event.kind === 30041 || event.kind === 30818}
      <div class="space-y-2 min-w-0 overflow-hidden">
        {#if event.content}
          <div class="text-sm text-gray-700 dark:text-gray-300">
            <div class="mb-2">
              <span class="font-semibold">
                {event.kind === 30041 ? 'Publication Content' : 'Wiki Content'}
              </span>
            </div>
            <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
              <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                {event.content.slice(0, 300)}
                {#if event.content.length > 300}
                  <span class="text-gray-500 dark:text-gray-400">...</span>
                {/if}
              </pre>
            </div>
          </div>
        {:else}
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Empty {event.kind === 30041 ? 'publication' : 'wiki'} content
          </div>
        {/if}
      </div>
    <!-- Long-form content (kind 30023) -->
    {:else if event.kind === 30023}
      <div class="space-y-2 min-w-0 overflow-hidden">
        {#if event.content}
          <div class="text-sm text-gray-700 dark:text-gray-300">
            <div class="mb-2">
              <span class="font-semibold">Long-form Content</span>
            </div>
            <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
              <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                {event.content.slice(0, 300)}
                {#if event.content.length > 300}
                  <span class="text-gray-500 dark:text-gray-400">...</span>
                {/if}
              </pre>
            </div>
          </div>
        {:else}
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Empty long-form content
          </div>
        {/if}
      </div>
    <!-- Reply/Comment content (kind 1111) -->
    {:else if event.kind === 1111}
      <div class="space-y-2 min-w-0 overflow-hidden">
        <div class="text-sm text-gray-700 dark:text-gray-300">
          <div class="mb-2">
            <span class="font-semibold">Reply/Comment</span>
          </div>
          {#if event.content && event.content.trim()}
            <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
              {@render parsedContent(event.content)}
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Empty reply
            </div>
          {/if}
        </div>
      </div>
    <!-- Git Issue content (kind 1621) -->
    {:else if event.kind === 1621}
      <div class="space-y-2 min-w-0 overflow-hidden">
        <div class="text-sm text-gray-700 dark:text-gray-300">
          <div class="mb-2">
            <span class="font-semibold">Git Issue</span>
            {#if event.tags}
              {@const subjectTag = event.tags.find(tag => tag[0] === 'subject')}
              {#if subjectTag && subjectTag[1]}
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Subject: {subjectTag[1]}
                </div>
              {/if}
            {/if}
          </div>
          {#if event.content && event.content.trim()}
            <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
              {@render parsedContent(event.content)}
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Empty issue description
            </div>
          {/if}
        </div>
      </div>
    <!-- Git Comment content (kind 1622) -->
    {:else if event.kind === 1622}
      <div class="space-y-2 min-w-0 overflow-hidden">
        <div class="text-sm text-gray-700 dark:text-gray-300">
          <div class="mb-2">
            <span class="font-semibold">Git Comment</span>
          </div>
          {#if event.content && event.content.trim()}
            <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
              {@render parsedContent(event.content)}
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Empty comment
            </div>
          {/if}
        </div>
      </div>
    <!-- Reaction content (kind 7) -->
    {:else if event.kind === 7}
      <div class="space-y-2 min-w-0 overflow-hidden">
        <div class="text-sm text-gray-700 dark:text-gray-300">
          <div class="mb-2">
            <span class="font-semibold">Reaction</span>
          </div>
          {#if event.content && event.content.trim()}
            <div class="text-lg">
              {event.content}
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Empty reaction
            </div>
          {/if}
        </div>
      </div>
    <!-- Zap receipt content (kind 9735) -->
    {:else if event.kind === 9735}
      <div class="space-y-2 min-w-0 overflow-hidden">
        <div class="text-sm text-gray-700 dark:text-gray-300">
          <div class="mb-2">
            <span class="font-semibold">Zap Receipt</span>
          </div>
          {#if event.content && event.content.trim()}
            {@const zapData = (() => {
              try {
                return JSON.parse(event.content);
              } catch {
                return null;
              }
            })()}
            {#if zapData}
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {#if zapData.amount}
                  <div>Amount: {zapData.amount} sats</div>
                {/if}
                {#if zapData.preimage}
                  <div>Preimage: {zapData.preimage.slice(0, 8)}...</div>
                {/if}
                {#if zapData.bolt11}
                  <div>Invoice: {zapData.bolt11.slice(0, 20)}...</div>
                {/if}
              </div>
            {:else}
              <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
                <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                  {event.content.slice(0, 200)}
                  {#if event.content.length > 200}
                    <span class="text-gray-500 dark:text-gray-400">...</span>
                  {/if}
                </pre>
              </div>
            {/if}
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Empty zap receipt
            </div>
          {/if}
        </div>
      </div>
    <!-- Image/media content (kind 20) -->
    {:else if event.kind === 20}
      <div class="space-y-2 min-w-0 overflow-hidden">
        <div class="text-sm text-gray-700 dark:text-gray-300">
          <div class="mb-2">
            <span class="font-semibold">Image/Media Post</span>
          </div>
          
          <!-- Render images from imeta tags -->
          {#if event.tags}
            {@const imetaTags = event.tags.filter(tag => tag[0] === 'imeta')}
            {#if imetaTags.length > 0}
              <div class="space-y-2">
                {#each imetaTags as imetaTag}
                  {@const imetaData = (() => {
                    const data: any = {};
                    for (let i = 1; i < imetaTag.length; i++) {
                      const item = imetaTag[i];
                      if (item.startsWith('url ')) {
                        data.url = item.substring(4);
                      } else if (item.startsWith('dim ')) {
                        data.dimensions = item.substring(4);
                      } else if (item.startsWith('m ')) {
                        data.mimeType = item.substring(2);
                      } else if (item.startsWith('size ')) {
                        data.size = item.substring(5);
                      } else if (item.startsWith('blurhash ')) {
                        data.blurhash = item.substring(9);
                      } else if (item.startsWith('x ')) {
                        data.x = item.substring(2);
                      }
                    }
                    return data;
                  })()}
                  
                  {#if imetaData.url && imetaData.mimeType?.startsWith('image/')}
                    <div class="relative">
                      <img 
                        src={imetaData.url} 
                        alt="imeta"
                        class="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                        style="max-height: 300px; object-fit: cover;"
                        onerror={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const fallback = (e.target as HTMLImageElement).nextElementSibling;
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                      />
                      <div class="hidden text-xs text-gray-500 dark:text-gray-400 mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                        Image failed to load: {imetaData.url}
                      </div>
                      
                      <!-- Image metadata -->
                      <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {#if imetaData.dimensions}
                          <span class="mr-2">Size: {imetaData.dimensions}</span>
                        {/if}
                        {#if imetaData.size}
                          <span class="mr-2">File: {Math.round(parseInt(imetaData.size) / 1024)}KB</span>
                        {/if}
                        {#if imetaData.mimeType}
                          <span>Type: {imetaData.mimeType}</span>
                        {/if}
                      </div>
                    </div>
                  {:else if imetaData.url}
                    <!-- Non-image media -->
                    <div class="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div class="text-sm text-gray-600 dark:text-gray-400">
                        <a href={imetaData.url} target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 hover:underline">
                          View Media ({imetaData.mimeType || 'unknown type'})
                        </a>
                      </div>
                      {#if imetaData.size}
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Size: {Math.round(parseInt(imetaData.size) / 1024)}KB
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/if}
          
          <!-- Text content -->
          {#if event.content && event.content.trim()}
            <div class="mt-3 prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
              {@render parsedContent(event.content)}
            </div>
          {/if}
          
          <!-- Alt text -->
          {#if event.tags}
            {@const altTag = event.tags.find(tag => tag[0] === 'alt')}
            {#if altTag && altTag[1]}
              <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                Alt: {altTag[1]}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    <!-- Profile content -->
    {:else if event.kind === 0 && profile}
      <div class="space-y-2 min-w-0 overflow-hidden">
        {#if profile.picture}
          <img 
            src={profile.picture} 
            alt="Profile" 
            class="w-12 h-12 rounded-full object-cover flex-shrink-0"
            onerror={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div class="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 hidden">
            <UserOutline class="w-6 h-6 text-gray-600 dark:text-gray-300" />
          </div>
        {:else}
          <div class="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
            <UserOutline class="w-6 h-6 text-gray-600 dark:text-gray-300" />
          </div>
        {/if}
        {#if profile.about}
          <p class="text-sm text-gray-700 dark:text-gray-300 break-words">
            {profile.about.slice(0, 200)}
            {#if profile.about.length > 200}
              <span class="text-gray-500 dark:text-gray-400">...</span>
            {/if}
          </p>
        {/if}
      </div>
    <!-- Generic content for other event kinds -->
    {:else if event.content}
      <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
        <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
          {event.content.slice(0, 300)}
          {#if event.content.length > 300}
            <span class="text-gray-500 dark:text-gray-400">...</span>
          {/if}
        </pre>
      </div>
    {:else}
      <div class="text-sm text-gray-500 dark:text-gray-400">
        No content
      </div>
    {/if}

    <!-- Event identifiers -->
    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 min-w-0 overflow-hidden">
      <div class="flex flex-wrap gap-2 text-xs min-w-0">
        <span class="text-gray-500 dark:text-gray-400 flex-shrink-0">ID:</span>
        <a 
          href="/events?id={event!.id}"
          class="font-mono text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 break-all cursor-pointer"
          onclick={(e) => {
            e.preventDefault();
            goto(`/events?id=${event!.id}`);
          }}
        >
          {event!.id.slice(0, 8)}...{event!.id.slice(-4)}
        </a>
        {#if isAddressableEvent(event!)}
          <span class="text-gray-500 dark:text-gray-400 flex-shrink-0">Address:</span>
          <span class="font-mono text-gray-700 dark:text-gray-300 break-all">
            {getNaddrUrl(event!).slice(0, 12)}...{getNaddrUrl(event!).slice(-8)}
          </span>
        {/if}
      </div>
    </div>
  </div>
{/if}
