<script lang="ts">
  import { get } from "svelte/store";
  import { userStore } from "$lib/stores/userStore";
  import { prefixNostrAddresses } from "$lib/utils/nostrUtils";
  import { removeMetadataFromContent } from "$lib/utils/asciidoc_metadata";
  import { build30040EventSet } from "$lib/utils/event_input_utils";
  import type { EventData, TagData, EventPreview } from "./types";

  // AI-NOTE: 2025-01-24 - EventPreview component shows a preview of the event that will be published
  // This component generates a preview based on the current form data

  let {
    ndk,
    eventData,
    tags,
    showJsonPreview,
    onTogglePreview,
  }: {
    ndk: any;
    eventData: EventData;
    tags: TagData[];
    showJsonPreview: boolean;
    onTogglePreview: () => void;
  } = $props();

  /**
   * Converts TagData array to NDK-compatible format
   */
  function convertTagsToNDKFormat(tags: TagData[]): string[][] {
    return tags
      .filter(tag => tag.key.trim() !== "")
      .map(tag => [tag.key, ...tag.values]);
  }

  /**
   * Generates event preview
   */
  let eventPreview = $derived.by(() => {
    const userState = get(userStore);
    const pubkey = userState.pubkey;
    
    if (!pubkey) {
      return null;
    }

    // Build the event data similar to how it's done in publishing
    const baseEvent = { 
      pubkey: String(pubkey), 
      created_at: eventData.createdAt,
      kind: Number(eventData.kind)
    };

    if (Number(eventData.kind) === 30040) {
      // For 30040, we need to show the index event structure
      try {
        // Convert tags to compatible format (exclude preset tags)
        const presetTagKeys = ["version", "d", "title"];
        const compatibleTags: [string, string][] = tags
          .filter(tag => tag.key.trim() !== "" && !presetTagKeys.includes(tag.key))
          .map(tag => [tag.key, tag.values[0] || ""] as [string, string]);
        
        // Create a mock NDK instance for preview
        const mockNdk = { sign: async () => ({ sig: "mock_signature" }) };
        
        const { indexEvent } = build30040EventSet(
          eventData.content,
          compatibleTags,
          baseEvent,
          mockNdk as any,
        );
        
        // Add preset tags from UI (version, d, title)
        const finalTags = indexEvent.tags.filter(tag => !presetTagKeys.includes(tag[0]));
        const versionTag = tags.find(t => t.key === "version");
        const dTag = tags.find(t => t.key === "d");
        const titleTag = tags.find(t => t.key === "title");
        
        if (versionTag && versionTag.values[0]) {
          finalTags.push(["version", versionTag.values[0]]);
        }
        if (dTag && dTag.values[0]) {
          finalTags.push(["d", dTag.values[0]]);
        }
        if (titleTag && titleTag.values[0]) {
          finalTags.push(["title", titleTag.values[0]]);
        }
        
        return {
          type: "30040_index_event",
          event: {
            id: "[will be generated]",
            pubkey: String(pubkey),
            created_at: eventData.createdAt,
            kind: 30040,
            tags: finalTags,
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
      let eventTags = convertTagsToNDKFormat(tags);

      // For AsciiDoc events, remove metadata from content
      let finalContent = eventData.content;
      if (eventData.kind === 30040 || eventData.kind === 30041) {
        finalContent = removeMetadataFromContent(eventData.content);
      }
      
      // Prefix Nostr addresses
      const prefixedContent = prefixNostrAddresses(finalContent);

      return {
        type: "standard_event",
        event: {
          id: "[will be generated]",
          pubkey: String(pubkey),
          created_at: eventData.createdAt,
          kind: Number(eventData.kind),
          tags: eventTags,
          content: prefixedContent,
          sig: "[will be generated]"
        }
      };
    }
  });
</script>

<!-- Event Preview Section -->
<div class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Event Preview</h3>
    <button
      type="button"
      class="btn btn-sm btn-outline btn-secondary"
      onclick={onTogglePreview}
    >
      {showJsonPreview ? 'Hide' : 'Show'} JSON Preview
    </button>
  </div>
  
  {#if showJsonPreview}
    {#if eventPreview}
      <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        {#if eventPreview.type === 'error'}
          <div class="text-red-600 dark:text-red-400 text-sm">
            {eventPreview.message}
          </div>
        {:else}
          <div class="mb-2">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Event Type: {eventPreview.type === '30040_index_event' ? '30040 Publication Index' : 'Standard Event'}
            </span>
          </div>
          <pre class="text-xs bg-white dark:bg-gray-900 p-3 rounded border overflow-x-auto text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap">{JSON.stringify(eventPreview.event, null, 2)}</pre>
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
