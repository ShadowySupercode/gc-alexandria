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
    extractDocumentMetadata, 
    extractSmartMetadata,
    metadataToTags,
    removeMetadataFromContent 
  } from "$lib/utils/asciidoc_metadata";
  import { get } from "svelte/store";
  import { ndkInstance } from "$lib/ndk";
  import { userPubkey } from "$lib/stores/authStore.Svelte";
  import { userStore } from "$lib/stores/userStore";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { prefixNostrAddresses } from "$lib/utils/nostrUtils";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { Button } from "flowbite-svelte";
  import { goto } from "$app/navigation";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";

  let kind = $state<number>(30040);
  let tags = $state<[string, string][]>([]);
  let content = $state("");
  let createdAt = $state<number>(Math.floor(Date.now() / 1000));
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let publishedRelays = $state<string[]>([]);

  let title = $state("");
  let dTag = $state("");
  let titleManuallyEdited = $state(false);
  let dTagManuallyEdited = $state(false);
  let dTagError = $state("");
  let lastPublishedEventId = $state<string | null>(null);
  let showWarning = $state(false);
  let warningMessage = $state("");
  let pendingPublish = $state(false);
  let extractedMetadata = $state<[string, string][]>([]);
  let hasLoadedFromStorage = $state(false);

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
      
      // Extract title and metadata using the standardized parser
      const { metadata } = extractSmartMetadata(content);
      if (metadata.title) {
        title = metadata.title;
        titleManuallyEdited = false;
        dTagManuallyEdited = false;
      }
      
      // Extract metadata for 30040 and 30041 events
      if (kind === 30040 || kind === 30041) {
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
    
    // Extract title and metadata using the standardized parser
    const { metadata } = extractSmartMetadata(content);
    
    if (!titleManuallyEdited) {
      console.log("Content input - extracted title:", metadata.title);
      title = metadata.title || "";
      // Reset dTagManuallyEdited when title changes so d-tag can be auto-generated
      dTagManuallyEdited = false;
    }
    
    // Extract metadata from AsciiDoc content for 30040 and 30041 events
    if (kind === 30040 || kind === 30041) {
      extractedMetadata = metadataToTags(metadata);
    } else {
      extractedMetadata = [];
    }
  }

  function handleTitleInput(e: Event) {
    title = (e.target as HTMLInputElement).value;
    titleManuallyEdited = true;
  }

  function handleDTagInput(e: Event) {
    dTag = (e.target as HTMLInputElement).value;
    dTagManuallyEdited = true;
  }

  $effect(() => {
    console.log(
      "Effect running - title:",
      title,
      "dTagManuallyEdited:",
      dTagManuallyEdited,
    );
    if (!dTagManuallyEdited) {
      const newDTag = titleToDTag(title);
      console.log("Setting dTag to:", newDTag);
      dTag = newDTag;
    }
  });

  function updateTag(index: number, key: string, value: string): void {
    tags = tags.map((t, i) => (i === index ? [key, value] : t));
  }
  function addTag(): void {
    tags = [...tags, ["", ""]];
  }
  function removeTag(index: number): void {
    tags = tags.filter((_, i) => i !== index);
  }

  function addExtractedTag(key: string, value: string): void {
    // Check if tag already exists
    const existingIndex = tags.findIndex(([k]) => k === key);
    if (existingIndex >= 0) {
      // Update existing tag
      tags = tags.map((t, i) => (i === existingIndex ? [key, value] : t));
    } else {
      // Add new tag
      tags = [...tags, [key, value]];
    }
  }

  function isValidKind(kind: number | string): boolean {
    const n = Number(kind);
    return Number.isInteger(n) && n >= 0 && n <= 65535;
  }

  function validate(): { valid: boolean; reason?: string; warning?: string } {
    const currentUserPubkey = get(userPubkey as any);
    const userState = get(userStore);
    
    // Try userPubkey first, then fallback to userStore
    const pubkey = currentUserPubkey || userState.pubkey;
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
    dTagError = "";
    error = null; // Clear any previous errors
    
    if (requiresDTag(kind) && (!dTag || dTag.trim() === "")) {
      dTagError = "A d-tag is required.";
      return;
    }
    
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
      const ndk = get(ndkInstance);
      const currentUserPubkey = get(userPubkey as any);
      const userState = get(userStore);
      
      // Try userPubkey first, then fallback to userStore
      const pubkey = currentUserPubkey || userState.pubkey;
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
      console.log("Title:", title);
      console.log("DTag:", dTag);

      if (Number(kind) === 30040) {
        console.log("=== 30040 EVENT CREATION START ===");
        console.log("Creating 30040 event set with content:", content);
        try {
          const { indexEvent, sectionEvents } = build30040EventSet(
            content,
            tags,
            baseEvent,
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
        let eventTags = [...tags];

        // Ensure d-tag exists and has a value for addressable events
        if (requiresDTag(kind)) {
          const dTagIndex = eventTags.findIndex(([k]) => k === "d");
          const dTagValue = dTag.trim() || getDTagForEvent(kind, content, "");

          if (dTagValue) {
            if (dTagIndex >= 0) {
              // Update existing d-tag
              eventTags[dTagIndex] = ["d", dTagValue];
            } else {
              // Add new d-tag
              eventTags = [...eventTags, ["d", dTagValue]];
            }
          }
        }

        // Add title tag if we have a title
        const titleValue = title.trim() || getTitleTagForEvent(kind, content);
        if (titleValue) {
          eventTags = [...eventTags, ["title", titleValue]];
        }

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
            tags: event.tags.map((tag) => [String(tag[0]), String(tag[1])]),
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
            "wss://relay.damus.io",
            "wss://relay.nostr.band",
            "wss://nos.lol",
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
</script>

<div
  class="w-full max-w-2xl mx-auto my-8 p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg"
>
  <h2 class="text-xl font-bold mb-4">Publish Nostr Event</h2>
  <form class="space-y-4" onsubmit={handleSubmit}>
    <div>
      <label class="block font-medium mb-1" for="event-kind">Kind</label>
      <input
        id="event-kind"
        type="text"
        class="input input-bordered w-full"
        bind:value={kind}
        required
      />
      {#if !isValidKind(kind)}
        <div class="text-red-600 text-sm mt-1">
          Kind must be an integer between 0 and 65535 (NIP-01).
        </div>
      {/if}
      {#if Number(kind) === 30040}
        <div
          class="text-blue-600 text-sm mt-1 bg-blue-50 dark:bg-blue-50 dark:text-blue-800 p-2 rounded whitespace-pre-wrap"
        >
          <strong>30040 - Publication Index:</strong>
          {get30040EventDescription()}
        </div>
      {/if}
    </div>
    <div>
      <label class="block font-medium mb-1" for="tags-container">Tags</label>
      
      <!-- Extracted Metadata Section -->
      {#if extractedMetadata.length > 0}
        <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            Extracted Metadata (from AsciiDoc header)
          </h4>
          <div class="space-y-2">
            {#each extractedMetadata as [key, value], i}
              <div class="flex gap-2 items-center">
                <span class="text-xs text-blue-600 dark:text-blue-400 min-w-[60px]">{key}:</span>
                <input
                  type="text"
                  class="input input-bordered input-sm flex-1 text-sm"
                  value={value}
                  readonly
                />
                <button
                  type="button"
                  class="btn btn-sm btn-outline btn-primary"
                  onclick={() => addExtractedTag(key, value)}
                >
                  Add to Tags
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      <div id="tags-container" class="space-y-2">
        {#each tags as [key, value], i}
          <div class="flex gap-2">
            <input
              type="text"
              class="input input-bordered flex-1"
              placeholder="tag"
              bind:value={tags[i][0]}
              oninput={(e) =>
                updateTag(i, (e.target as HTMLInputElement).value, tags[i][1])}
            />
            <input
              type="text"
              class="input input-bordered flex-1"
              placeholder="value"
              bind:value={tags[i][1]}
              oninput={(e) =>
                updateTag(i, tags[i][0], (e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="btn btn-error btn-sm"
              onclick={() => removeTag(i)}
              disabled={tags.length === 1}>×</button
            >
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
      <label class="block font-medium mb-1" for="event-content">Content</label>
      <textarea
        id="event-content"
        bind:value={content}
        oninput={handleContentInput}
        placeholder="Content (start with a header for the title)"
        class="textarea textarea-bordered w-full h-40"
        required
      ></textarea>
    </div>
    <div>
      <label class="block font-medium mb-1" for="event-title">Title</label>
      <input
        type="text"
        id="event-title"
        bind:value={title}
        oninput={handleTitleInput}
        placeholder="Title (auto-filled from header)"
        class="input input-bordered w-full"
      />
    </div>
    <div>
      <label class="block font-medium mb-1" for="event-d-tag">d-tag</label>
      <input
        type="text"
        id="event-d-tag"
        bind:value={dTag}
        oninput={handleDTagInput}
        placeholder="d-tag (auto-generated from title)"
        class="input input-bordered w-full"
        required={requiresDTag(kind)}
      />
      {#if dTagError}
        <div class="text-red-600 text-sm mt-1">{dTagError}</div>
      {/if}
    </div>
    <div class="flex justify-end">
      <button
        type="submit"
        class="btn btn-primary border border-primary-600 px-4 py-2"
        disabled={loading}>Publish</button
      >
    </div>
    {#if loading}
      <span class="ml-2 text-gray-500">Publishing...</span>
    {/if}
    {#if error}
      <div class="mt-2 text-red-600">{error}</div>
    {/if}
    {#if success}
      <div class="mt-2 text-green-600">{success}</div>
      <div class="text-xs text-gray-500">
        Relays: {publishedRelays.join(", ")}
      </div>
      {#if lastPublishedEventId}
        <div class="mt-2 text-green-700">
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
  </div>

  {#if showWarning}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md mx-4">
        <h3 class="text-lg font-bold mb-4">Warning</h3>
        <p class="mb-4">{warningMessage}</p>
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
