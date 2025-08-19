<script lang="ts">
  import {
    getTitleTagForEvent,
    getDTagForEvent,
    requiresDTag,
    validateNotAsciidoc,
    validateAsciiDoc,
    build30040EventSet,
    titleToDTag,
    validate30040EventSet,
    get30040EventDescription,
    analyze30040Event,
    get30040FixGuidance,
  } from "$lib/utils/event_input_utils";
  import { 
    extractSmartMetadata,
    metadataToTags,
    removeMetadataFromContent 
  } from "$lib/utils/asciidoc_metadata";
  import { get } from "svelte/store";
  
  import { userStore } from "$lib/stores/userStore";
  import NDK, { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { prefixNostrAddresses } from "$lib/utils/nostrUtils";
  import { fetchEventWithFallback } from "$lib/utils/nostrUtils";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";
  import { Button, Tooltip } from "flowbite-svelte";
  import { goto } from "$app/navigation";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { anonymousRelays } from "$lib/consts";

  const ndk = getNdkContext();

  let kind = $state<number>(30040);
  let tags = $state<string[][]>([]);
  let content = $state("");
  let createdAt = $state<number>(Math.floor(Date.now() / 1000));
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let publishedRelays = $state<string[]>([]);

  let lastPublishedEventId = $state<string | null>(null);
  let showWarning = $state(false);
  let warningMessage = $state("");
  let pendingPublish = $state(false);
  let extractedMetadata = $state<[string, string][]>([]);
  let hasLoadedFromStorage = $state(false);
  let showJsonPreview = $state(false);
  let removedTags = $state<Set<string>>(new Set());
  let eventIdSearch = $state("");
  let loadingEvent = $state(false);

  // AI-NOTE: 2025-01-24 - Initialize default tags when component loads
  // This ensures default tags are visible in the UI from the start
  $effect(() => {
    // Only run this initialization once when the component first loads
    if (tags.length === 0) {
      const initialTags: string[][] = [];
      
      // Add default version tag for 30040 events
      if (kind === 30040) {
        initialTags.push(["version", "1"]);
        // Always add d-tag and title tag for 30040 events, even if empty
        initialTags.push(["d", ""]);
        initialTags.push(["title", ""]);
      }
      
      // Add empty tag row for user input
      initialTags.push(["", ""]);
      
      tags = initialTags;
      console.log("Initialized default tags:", tags);
    }
  });

  // Add default tags for different event types
  $effect(() => {
    if (kind === 30040 && !removedTags.has("version")) {
      // Check if version tag already exists
      const versionTagIndex = tags.findIndex(tag => tag[0] === "version");
      if (versionTagIndex === -1) {
        // Add default version tag if it doesn't exist
        tags = [...tags, ["version", "1"]];
      }
    }
    
    // Add d-tag and title tags for addressable events
    if (requiresDTag(kind)) {
      // Extract title from content
      const { metadata } = extractSmartMetadata(content);
      const title = metadata.title || "";
      const dTagValue = titleToDTag(title);
      
      // Add d-tag if it doesn't exist and hasn't been removed
      if (!removedTags.has("d")) {
        const dTagIndex = tags.findIndex(tag => tag[0] === "d");
        if (dTagIndex === -1) {
          // Always add d-tag for 30040 events, even if empty
          tags = [...tags, ["d", dTagValue || ""]];
        } else {
          // Update existing d-tag
          tags[dTagIndex][1] = dTagValue || "";
        }
      }
      
      // Add title tag if it doesn't exist and hasn't been removed
      if (!removedTags.has("title")) {
        const titleTagIndex = tags.findIndex(tag => tag[0] === "title");
        if (titleTagIndex === -1) {
          // Always add title tag for 30040 events, even if empty
          tags = [...tags, ["title", title || ""]];
        } else {
          // Update existing title tag
          tags[titleTagIndex][1] = title || "";
        }
      }
    }
    
    // AI-NOTE: 2025-01-24 - Ensure there's always at least one empty tag row for users to add new tags
    // This ensures the UI is always interactive even when default tags are present
    if (tags.length === 0) {
      tags = [["", ""]];
    }
  });

  // Load content from sessionStorage if available (from ZettelEditor)
  $effect(() => {
    if (hasLoadedFromStorage) return; // Prevent multiple loads
    
    const storedContent = sessionStorage.getItem('zettelEditorContent');
    const storedSource = sessionStorage.getItem('zettelEditorSource');
    
    if (storedContent && storedSource === 'publication-format') {
      content = storedContent;
      hasLoadedFromStorage = true;
      
      // Clear the stored content after loading
      sessionStorage.removeItem('zettelEditorContent');
      sessionStorage.removeItem('zettelEditorSource');
      
      // Extract metadata for 30040 and 30041 events
      if (kind === 30040 || kind === 30041) {
        const { metadata } = extractSmartMetadata(content);
        extractedMetadata = metadataToTags(metadata);
      }
    }
  });

  /**
   * Extracts the first Markdown/AsciiDoc header as the title using the standardized parser.
   */
  function extractTitleFromContent(content: string): string {
    const { metadata } = extractSmartMetadata(content);
    return metadata.title || "";
  }

  function handleContentInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    
    // Extract metadata from AsciiDoc content for 30040 and 30041 events
    if (kind === 30040 || kind === 30041) {
      const { metadata } = extractSmartMetadata(content);
      extractedMetadata = metadataToTags(metadata);
    } else {
      extractedMetadata = [];
    }
  }






  
  function addTag(): void {
    tags = [...tags, ["", ""]];
  }
  
  function addTagValue(tagIndex: number): void {
    tags = tags.map((t, i) => {
      if (i === tagIndex) {
        return [...t, ""];
      }
      return t;
    });
  }
  
  function removeTagValue(tagIndex: number, valueIndex: number): void {
    tags = tags.map((t, i) => {
      if (i === tagIndex) {
        const newTag = t.filter((_, vi) => vi  !== valueIndex);
        // Ensure we always have at least the key and one value
        return newTag.length >= 2 ? newTag : [newTag[0] || "", ""];
      }
      return t;
    });
  }
  
  // AI-NOTE: 2025-01-24 - Fixed tag deletion to allow removing all tags and automatically add empty row
  function removeTag(index: number): void {
    // Get the tag key before removing it
    const tagKey = tags[index]?.[0];
    
    // Remove the tag at the specified index
    tags = tags.filter((_, i) => i !== index);
    
    // Track that this tag was manually removed
    if (tagKey && (tagKey === "version" || tagKey === "d" || tagKey === "title")) {
      removedTags.add(tagKey);
    }
    
    // If no tags remain, add an empty tag row so users can continue adding tags
    if (tags.length === 0) {
      tags = [["", ""]];
    }
  }

  function isValidKind(kind: number | string): boolean {
    const n = Number(kind);
    return Number.isInteger(n) && n >= 0 && n <= 65535;
  }

  function validate(): { valid: boolean; reason?: string; warning?: string } {
    const userState = get(userStore);
    
    const pubkey = userState.pubkey;
    if (!pubkey) return { valid: false, reason: "Not logged in." };
    
    if (!content.trim()) return { valid: false, reason: "Content required." };
    if (kind === 30023) {
      const v = validateNotAsciidoc(content);
      if (!v.valid) return v;
    }
    if (kind === 30040) {
      const v = validate30040EventSet(content);
      if (!v.valid) return v;
      if (v.warning) return { valid: true, warning: v.warning };
    }
    if (kind === 30041 || kind === 30818) {
      const v = validateAsciiDoc(content);
      if (!v.valid) return v;
    }
    return { valid: true };
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null; // Clear any previous errors
    
    const validation = validate();
    if (!validation.valid) {
      error = validation.reason || "Validation failed.";
      return;
    }
    
    if (validation.warning) {
      warningMessage = validation.warning;
      showWarning = true;
      pendingPublish = true;
      return;
    }
    
    handlePublish();
  }

  async function handlePublish(): Promise<void> {
    error = null;
    success = null;
    publishedRelays = [];
    loading = true;
    createdAt = Math.floor(Date.now() / 1000);

    try {
      const userState = get(userStore);
      
      const pubkey = userState.pubkey;
      if (!ndk || !pubkey) {
        error = "NDK or pubkey missing.";
        loading = false;
        return;
      }
      const pubkeyString = String(pubkey);

      if (!/^[a-fA-F0-9]{64}$/.test(pubkeyString)) {
        error = "Invalid public key: must be a 64-character hex string.";
        loading = false;
        return;
      }

      // Validate before proceeding
      const validation = validate();
      if (!validation.valid) {
        error = validation.reason || "Validation failed.";
        loading = false;
        return;
      }

      const baseEvent = { pubkey: pubkeyString, created_at: createdAt };
      let events: NDKEvent[] = [];

      console.log("Publishing event with kind:", kind);
      console.log("Content length:", content.length);
      console.log("Content preview:", content.substring(0, 100));
      console.log("Tags:", tags);

      if (Number(kind) === 30040) {
        console.log("=== 30040 EVENT CREATION START ===");
        console.log("Creating 30040 event set with content:", content);
        try {
          // Convert multi-value tags to the format expected by build30040EventSet
          const compatibleTags: [string, string][] = tags
            .filter(tag => tag.length >= 2 && tag[0].trim() !== "")
            .map(tag => [tag[0], tag[1] || ""] as [string, string]);
          
          const { indexEvent, sectionEvents } = build30040EventSet(
            content,
            compatibleTags,
            baseEvent,
            ndk,
          );
          console.log("Index event:", indexEvent);
          console.log("Section events:", sectionEvents);
          // Publish all 30041 section events first, then the 30040 index event
          events = [...sectionEvents, indexEvent];
          console.log("Total events to publish:", events.length);

          // Debug the index event to ensure it's correct
          const indexEventData = {
            content: indexEvent.content,
            tags: indexEvent.tags.map(
              (tag) => [tag[0], tag[1]] as [string, string],
            ),
            kind: indexEvent.kind || 30040,
          };
          const analysis = debug30040Event(indexEventData);
          if (!analysis.valid) {
            console.warn("30040 index event has issues:", analysis.issues);
          }
          console.log("=== 30040 EVENT CREATION END ===");
        } catch (error) {
          console.error("Error in build30040EventSet:", error);
          error = `Failed to build 30040 event set: ${error instanceof Error ? error.message : "Unknown error"}`;
          loading = false;
          return;
        }
      } else {
        // Convert multi-value tags to the format expected by NDK
        let eventTags = tags
          .filter(tag => tag.length >= 2 && tag[0].trim() !== "")
          .map(tag => [...tag]); // Keep all values



        // For AsciiDoc events, remove metadata from content
        let finalContent = content;
        if (kind === 30040 || kind === 30041) {
          finalContent = removeMetadataFromContent(content);
        }
        
        // Prefix Nostr addresses before publishing
        const prefixedContent = prefixNostrAddresses(finalContent);

        // Create event with proper serialization
        const eventData = {
          kind,
          content: prefixedContent,
          tags: eventTags,
          pubkey: pubkeyString,
          created_at: createdAt,
        };

        events = [new NDKEventClass(ndk, eventData)];
      }

      let atLeastOne = false;
      let relaysPublished: string[] = [];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        try {
          console.log("Publishing event:", {
            kind: event.kind,
            content: event.content,
            tags: event.tags,
            hasContent: event.content && event.content.length > 0,
          });

          // Always sign with a plain object if window.nostr is available
          // Create a completely plain object to avoid proxy cloning issues
          const plainEvent = {
            kind: Number(event.kind),
            pubkey: String(event.pubkey),
            created_at: Number(
              event.created_at ?? Math.floor(Date.now() / 1000),
            ),
            tags: event.tags.map((tag) => tag.map(String)),
            content: String(event.content),
          };
          if (
            typeof window !== "undefined" &&
            window.nostr &&
            window.nostr.signEvent
          ) {
            const signed = await window.nostr.signEvent(plainEvent);
            event.sig = signed.sig;
            if ("id" in signed) {
              event.id = signed.id as string;
            }
          } else {
            await event.sign();
          }

          // Use direct WebSocket publishing like CommentBox does
          const signedEvent = {
            ...plainEvent,
            id: event.id,
            sig: event.sig,
          };

          // Try to publish to relays directly
          const relays = [
            ...anonymousRelays,
            ...$activeOutboxRelays,
            ...$activeInboxRelays,
          ];
          let published = false;

          for (const relayUrl of relays) {
            try {
              const ws = await WebSocketPool.instance.acquire(relayUrl);

              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  WebSocketPool.instance.release(ws);
                  reject(new Error("Timeout"));
                }, 5000);

                ws.onmessage = (e) => {
                  const [type, id, ok, message] = JSON.parse(e.data);
                  if (type === "OK" && id === signedEvent.id) {
                    clearTimeout(timeout);
                    if (ok) {
                      published = true;
                      relaysPublished.push(relayUrl);
                      WebSocketPool.instance.release(ws);
                      resolve();
                    } else {
                      WebSocketPool.instance.release(ws);
                      reject(new Error(message));
                    }
                  }
                };

                // Send the event to the relay
                ws.send(JSON.stringify(["EVENT", signedEvent]));
              });
              if (published) break;
            } catch (e) {
              console.error(`Failed to publish to ${relayUrl}:`, e);
            }
          }

          if (published) {
            atLeastOne = true;
            // For 30040, set lastPublishedEventId to the index event (last in array)
            if (Number(kind) === 30040) {
              if (i === events.length - 1) {
                lastPublishedEventId = event.id;
              }
            } else {
              lastPublishedEventId = event.id;
            }
          }
        } catch (signError) {
          console.error("Error signing/publishing event:", signError);
          error = `Failed to sign event: ${signError instanceof Error ? signError.message : "Unknown error"}`;
          loading = false;
          return;
        }
      }

      loading = false;
      if (atLeastOne) {
        publishedRelays = relaysPublished;
        success = `Published to ${relaysPublished.length} relay(s).`;
      } else {
        error = "Failed to publish to any relay.";
      }
    } catch (err) {
      console.error("Error in handlePublish:", err);
      error = `Publishing failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      loading = false;
    }
  }

  /**
   * Debug function to analyze a 30040 event and provide guidance.
   */
  function debug30040Event(eventData: {
    content: string;
    tags: [string, string][];
    kind: number;
  }) {
    const analysis = analyze30040Event(eventData);
    console.log("30040 Event Analysis:", analysis);
    if (!analysis.valid) {
      console.log("Guidance:", get30040FixGuidance());
    }
    return analysis;
  }

  function viewPublishedEvent() {
    if (lastPublishedEventId) {
      goto(`/events?id=${encodeURIComponent(lastPublishedEventId)}`);
    }
  }

  function confirmWarning() {
    showWarning = false;
    pendingPublish = false;
    handlePublish();
  }

  function cancelWarning() {
    showWarning = false;
    pendingPublish = false;
    warningMessage = "";
  }

  /**
   * Clears all form fields and resets to initial state.
   */
  function clearForm(): void {
    kind = 30040;
    tags = [];
    content = "";
    createdAt = Math.floor(Date.now() / 1000);
    error = null;
    success = null;
    publishedRelays = [];
    lastPublishedEventId = null;
    showWarning = false;
    warningMessage = "";
    pendingPublish = false;
    extractedMetadata = [];
    showJsonPreview = false;
    removedTags = new Set();
    eventIdSearch = "";
    
    // Reset to initial state - the $effect will handle adding default tags
    console.log("Form cleared");
  }

  /**
   * Loads an event by its hex ID for editing.
   */
  async function loadEventById(): Promise<void> {
    if (!eventIdSearch.trim()) {
      error = "Please enter an event ID.";
      return;
    }

    const eventId = eventIdSearch.trim();
    
    // Validate hex format
    if (!/^[a-fA-F0-9]{64}$/.test(eventId)) {
      error = "Invalid event ID format. Must be a 64-character hex string.";
      return;
    }

    loadingEvent = true;
    error = null;

    try {
      // AI-NOTE: 2025-01-24 - Use fetchEventWithFallback for comprehensive relay search
      // This ensures we search across ALL available relays including local, inbox, outbox, and fallback relays
      const foundEvent = await fetchEventWithFallback(ndk, eventId, 10000);

      if (foundEvent) {
        // Populate form with event data
        kind = foundEvent.kind || 30040;
        content = foundEvent.content || "";
        createdAt = Math.floor(Date.now() / 1000); // Use current time for replacement
        tags = foundEvent.tags.map((tag: string[]) => [...tag]);
        removedTags = new Set(); // Reset removed tags
        
        // Extract metadata if applicable
        if (kind === 30040 || kind === 30041) {
          const { metadata } = extractSmartMetadata(content);
          extractedMetadata = metadataToTags(metadata);
        }
        
        success = `Loaded event ${eventId.substring(0, 8)}...`;
        console.log("Loaded event:", foundEvent);
      } else {
        error = `Event ${eventId} not found on any relay.`;
      }
    } catch (err) {
      console.error("Error loading event:", err);
      error = `Failed to load event: ${err instanceof Error ? err.message : "Unknown error"}`;
    } finally {
      loadingEvent = false;
    }
  }

  /**
   * Generates a preview of what the event would look like if published.
   */
  let eventPreview = $derived(() => {
    const userState = get(userStore);
    const pubkey = userState.pubkey;
    
    if (!pubkey) {
      return null;
    }

    // Build the event data similar to how it's done in handlePublish
    const baseEvent = { 
      pubkey: String(pubkey), 
      created_at: createdAt,
      kind: Number(kind)
    };

    if (Number(kind) === 30040) {
      // For 30040, we need to show the index event structure
      try {
        // Convert multi-value tags to the format expected by build30040EventSet
        const compatibleTags: [string, string][] = tags
          .filter(tag => tag.length >= 2 && tag[0].trim() !== "")
          .map(tag => [tag[0], tag[1] || ""] as [string, string]);
        
        // Create a mock NDK instance for preview
        const mockNdk = { sign: async () => ({ sig: "mock_signature" }) };
        
        const { indexEvent } = build30040EventSet(
          content,
          compatibleTags,
          baseEvent,
          mockNdk as any,
        );

        return {
          type: "30040_index_event",
          event: {
            id: "[will be generated]",
            pubkey: String(pubkey),
            created_at: createdAt,
            kind: 30040,
            tags: indexEvent.tags,
            content: indexEvent.content,
            sig: "[will be generated]"
          }
        };
      } catch (error) {
        return {
          type: "error",
          message: `Failed to generate 30040 preview: ${error instanceof Error ? error.message : "Unknown error"}`
        };
      }
    } else {
      // For other event types
      let eventTags = tags
        .filter(tag => tag.length >= 2 && tag[0].trim() !== "")
        .map(tag => [...tag]);



      // For AsciiDoc events, remove metadata from content
      let finalContent = content;
      if (kind === 30040 || kind === 30041) {
        finalContent = removeMetadataFromContent(content);
      }
      
      // Prefix Nostr addresses
      const prefixedContent = prefixNostrAddresses(finalContent);

      return {
        type: "standard_event",
        event: {
          id: "[will be generated]",
          pubkey: String(pubkey),
          created_at: createdAt,
          kind: Number(kind),
          tags: eventTags,
          content: prefixedContent,
          sig: "[will be generated]"
        }
      };
    }
  });
</script>

<div
  class="w-full max-w-2xl mx-auto my-8 p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg"
>
  <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Publish Nostr Event</h2>
  
  <!-- Event ID Search Section -->
  <div class="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
    <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Load Existing Event</h3>
    <div class="flex gap-2">
      <input
        type="text"
        class="input input-bordered flex-1"
        placeholder="Enter 64-character hex event ID"
        bind:value={eventIdSearch}
        maxlength="64"
        onkeydown={(e) => {
          if (e.key === 'Enter' && !loadingEvent && eventIdSearch.trim()) {
            e.preventDefault();
            loadEventById();
          }
        }}
      />
      <button
        type="button"
        class="btn btn-secondary"
        onclick={loadEventById}
        disabled={loadingEvent || !eventIdSearch.trim()}
      >
        {loadingEvent ? 'Loading...' : 'Load Event'}
      </button>
    </div>
    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
      Load an existing event to edit and publish as a replacement with your signature.
    </p>
  </div>
  
  <form class="space-y-4" onsubmit={handleSubmit}>
    <div>
      <label class="block font-medium mb-1 text-gray-700 dark:text-gray-300" for="event-kind">Kind</label>
      <input
        id="event-kind"
        type="text"
        class="input input-bordered w-full"
        bind:value={kind}
        required
      />
      {#if !isValidKind(kind)}
        <div class="text-red-600 dark:text-red-400 text-sm mt-1">
          Kind must be an integer between 0 and 65535 (NIP-01).
        </div>
      {/if}
      {#if Number(kind) === 30040}
        <div class="flex items-center gap-2 mt-1">
          <span class="text-sm text-gray-600 dark:text-gray-400">Publication Index</span>
          <Tooltip class="tooltip-leather" type="auto" placement="bottom">
            <button
              type="button"
              class="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center text-sm font-bold border border-blue-600 shadow-sm"
              title="Learn more about Publication Index events"
            >
              ?
            </button>
            <div class="max-w-sm p-2 text-xs">
              <strong>30040 - Publication Index:</strong> Events that organize AsciiDoc content into structured publications with metadata tags and section references.
            </div>
          </Tooltip>
        </div>
      {/if}
    </div>
    <div>
      <label class="block font-medium mb-1 text-gray-700 dark:text-gray-300" for="tags-container">Tags</label>
      
      <!-- Extracted Metadata Section -->
      {#if extractedMetadata.length > 0}
        <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            Extracted Metadata (from AsciiDoc header)
          </h4>
          <div class="text-sm text-blue-700 dark:text-blue-300">
            {extractedMetadata.map(([key, value]) => `${key}: ${value}`).join(', ')}
          </div>
        </div>
      {/if}
      
      <div id="tags-container" class="space-y-2">
        {#each tags as tag, i}
          <div class="border border-gray-300 dark:border-gray-600 rounded-lg p-3 space-y-2">
            <div class="flex gap-2 items-center">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">Tag:</span>
              <input
                type="text"
                class="input input-bordered flex-1"
                placeholder="tag key (e.g., q, p, e)"
                bind:value={tags[i][0]}
              />
              <button
                type="button"
                class="btn btn-error btn-sm"
                onclick={() => removeTag(i)}>×</button
              >
            </div>
            
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">Values:</span>
                <button
                  type="button"
                  class="btn btn-sm btn-outline btn-primary"
                  onclick={() => addTagValue(i)}
                >
                  Add Value
                </button>
              </div>
              
              {#each tag.slice(1) as value, valueIndex}
                <div class="flex gap-2 items-center">
                  <span class="text-xs text-gray-500 dark:text-gray-400 min-w-[40px]">{valueIndex + 1}:</span>
                  <input
                    type="text"
                    class="input input-bordered flex-1"
                    placeholder="value"
                    bind:value={tags[i][valueIndex + 1]}
                  />
                  {#if tag.length > 2}
                    <button
                      type="button"
                      class="btn btn-sm btn-outline btn-error"
                      onclick={() => removeTagValue(i, valueIndex + 1)}
                    >
                      ×
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
        <div class="flex justify-end">
          <button
            type="button"
            class="btn btn-primary btn-sm border border-primary-600 px-3 py-1"
            onclick={addTag}>Add Tag</button
          >
        </div>
      </div>
    </div>
    <div>
      <label class="block font-medium mb-1 text-gray-700 dark:text-gray-300" for="event-content">Content</label>
      <textarea
        id="event-content"
        bind:value={content}
        oninput={handleContentInput}
        placeholder="Content (start with a header for the title)"
        class="textarea textarea-bordered w-full h-40"
        required
      ></textarea>
    </div>

    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="btn btn-outline btn-secondary"
        onclick={clearForm}
      >
        Clear Form
      </button>
      <button
        type="submit"
        class="btn btn-primary border border-primary-600 px-4 py-2"
        disabled={loading}>Publish</button
      >
    </div>
    {#if loading}
      <span class="ml-2 text-gray-500 dark:text-gray-400">Publishing...</span>
    {/if}
    {#if error}
      <div class="mt-2 text-red-600 dark:text-red-400">{error}</div>
    {/if}
    {#if success}
      <div class="mt-2 text-green-600 dark:text-green-400">{success}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400">
        Relays: {publishedRelays.join(", ")}
      </div>
      {#if lastPublishedEventId}
        <div class="mt-2 text-green-700 dark:text-green-300">
          Event ID: <span class="font-mono">{lastPublishedEventId}</span>
          <Button
            onclick={viewPublishedEvent}
            class="text-blue-600 dark:text-blue-500 hover:underline ml-2"
          >
            View your event
          </Button>
        </div>
      {/if}
    {/if}
  </form>

  <!-- JSON Preview Section -->
  <div class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Event Preview</h3>
      <button
        type="button"
        class="btn btn-sm btn-outline btn-secondary"
        onclick={() => showJsonPreview = !showJsonPreview}
      >
        {showJsonPreview ? 'Hide' : 'Show'} JSON Preview
      </button>
    </div>
    
    {#if showJsonPreview}
      {@const preview = eventPreview()}
      {#if preview}
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
          {#if preview.type === 'error'}
            <div class="text-red-600 dark:text-red-400 text-sm">
              {preview.message}
            </div>
          {:else}
            <div class="mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Event Type: {preview.type === '30040_index_event' ? '30040 Publication Index' : 'Standard Event'}
              </span>
            </div>
            <pre class="text-xs bg-white dark:bg-gray-900 p-3 rounded border overflow-x-auto text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap">{JSON.stringify(preview.event, null, 2)}</pre>
          {/if}
        </div>
      {:else}
        <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-700">
          <div class="text-yellow-800 dark:text-yellow-200 text-sm">
            Please log in to see the event preview.
          </div>
        </div>
      {/if}
    {/if}
  </div>

  {#if showWarning}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md mx-4">
              <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Warning</h3>
        <p class="mb-4 text-gray-700 dark:text-gray-300">{warningMessage}</p>
        <div class="flex justify-end space-x-2">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={cancelWarning}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onclick={confirmWarning}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
