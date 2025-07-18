<script lang="ts">
  import {
    getTitleTagForEvent,
    getDTagForEvent,
    requiresDTag,
    hasDTag,
    validateNotAsciidoc,
    validateAsciiDoc,
    build30040EventSet,
    titleToDTag,
    validate30040EventSet,
    get30040EventDescription,
    analyze30040Event,
    get30040FixGuidance,
  } from "$lib/utils/event_input_utils";
  import { get } from "svelte/store";
  import { ndkInstance } from "$lib/ndk";
  import { userPubkey } from "$lib/stores/authStore.Svelte";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { prefixNostrAddresses } from "$lib/utils/nostrUtils";
  import { standardRelays } from "$lib/consts";
  import { Button } from "flowbite-svelte";
  import { nip19 } from "nostr-tools";
  import { goto } from "$app/navigation";

  let kind = $state<number>(30023);
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

  /**
   * Extracts the first Markdown/AsciiDoc header as the title.
   */
  function extractTitleFromContent(content: string): string {
    // Match Markdown (# Title) or AsciiDoc (= Title) headers
    const match = content.match(/^(#|=)\s*(.+)$/m);
    return match ? match[2].trim() : "";
  }

  function handleContentInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    if (!titleManuallyEdited) {
      const extracted = extractTitleFromContent(content);
      console.log("Content input - extracted title:", extracted);
      title = extracted;
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

  function isValidKind(kind: number | string): boolean {
    const n = Number(kind);
    return Number.isInteger(n) && n >= 0 && n <= 65535;
  }

  function validate(): { valid: boolean; reason?: string } {
    const currentUserPubkey = get(userPubkey as any);
    if (!currentUserPubkey) return { valid: false, reason: "Not logged in." };
    const pubkey = String(currentUserPubkey);
    if (!content.trim()) return { valid: false, reason: "Content required." };
    if (kind === 30023) {
      const v = validateNotAsciidoc(content);
      if (!v.valid) return v;
    }
    if (kind === 30040) {
      const v = validate30040EventSet(content);
      if (!v.valid) return v;
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
    if (requiresDTag(kind) && (!dTag || dTag.trim() === "")) {
      dTagError = "A d-tag is required.";
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
      if (!ndk || !currentUserPubkey) {
        error = "NDK or pubkey missing.";
        loading = false;
        return;
      }
      const pubkey = String(currentUserPubkey);

      if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
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

      const baseEvent = { pubkey, created_at: createdAt };
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

        // Prefix Nostr addresses before publishing
        const prefixedContent = prefixNostrAddresses(content);

        // Create event with proper serialization
        const eventData = {
          kind,
          content: prefixedContent,
          tags: eventTags,
          pubkey,
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
            ...standardRelays,
          ];
          let published = false;

          for (const relayUrl of relays) {
            try {
              const ws = new WebSocket(relayUrl);
              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  ws.close();
                  reject(new Error("Timeout"));
                }, 5000);

                ws.onopen = () => {
                  ws.send(JSON.stringify(["EVENT", signedEvent]));
                };

                ws.onmessage = (e) => {
                  const [type, id, ok, message] = JSON.parse(e.data);
                  if (type === "OK" && id === signedEvent.id) {
                    clearTimeout(timeout);
                    if (ok) {
                      published = true;
                      relaysPublished.push(relayUrl);
                      ws.close();
                      resolve();
                    } else {
                      ws.close();
                      reject(new Error(message));
                    }
                  }
                };

                ws.onerror = () => {
                  clearTimeout(timeout);
                  ws.close();
                  reject(new Error("WebSocket error"));
                };
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
      {#if kind === 30040}
        <div
          class="text-blue-600 text-sm mt-1 bg-blue-50 dark:bg-blue-900 p-2 rounded"
        >
          <strong>30040 - Publication Index:</strong>
          {get30040EventDescription()}
        </div>
      {/if}
    </div>
    <div>
      <label class="block font-medium mb-1" for="tags-container">Tags</label>
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
            class="text-primary-600 dark:text-primary-500 hover:underline ml-2"
          >
            View your event
          </Button>
        </div>
      {/if}
    {/if}
  </form>
</div>
