<script lang="ts">
  import { onMount } from "svelte";
  import { userStore } from "$lib/stores/userStore";
  import { ndkInstance } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { get } from "svelte/store";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import { getTitleTagForEvent } from "$lib/utils/event_input_utils";
  import asciidoctor from "asciidoctor";
  import { postProcessAsciidoctorHtml } from "$lib/utils/markup/asciidoctorPostProcessor";

  let events: NDKEvent[] = [];
  let loading = true;
  let error: string | null = null;
  let showTags: Record<string, boolean> = {};
  let renderedContent: Record<string, string> = {};

  // Tag type and tag filter state
  const tagTypes = ["t", "title", "m", "w"]; // 'm' is MIME type
  let selectedTagTypes: Set<string> = new Set();
  let tagTypeLabels: Record<string, string> = {
    t: "hashtag",
    title: "",
    m: "mime",
    w: "wiki",
  };
  let tagFilter: Set<string> = new Set();

  // Unique tags by type
  let uniqueTagsByType: Record<string, Set<string>> = {};
  let allUniqueTags: Set<string> = new Set();

  async function fetchMyNotes() {
    loading = true;
    error = null;
    try {
      const user = get(userStore);
      if (!user.pubkey) {
        error = "You must be logged in to view your notes.";
        loading = false;
        return;
      }
      const ndk = get(ndkInstance);
      if (!ndk) {
        error = "NDK not initialized.";
        loading = false;
        return;
      }
      const eventSet = await ndk.fetchEvents({
        kinds: [30041],
        authors: [user.pubkey],
        limit: 1000,
      });
      events = Array.from(eventSet)
        .filter((e): e is NDKEvent => !!e && typeof e.created_at === "number")
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
      // Render AsciiDoc for each event
      for (const event of events) {
        const html = asciidoctor().convert(event.content, {
          standalone: false,
          doctype: "article",
          attributes: { showtitle: true, sectids: true },
        });
        renderedContent[event.id] = await postProcessAsciidoctorHtml(
          html as string,
        );
      }
      // Collect unique tags by type
      uniqueTagsByType = {};
      allUniqueTags = new Set();
      for (const event of events) {
        for (const tag of event.tags || []) {
          if (tag.length >= 2 && tag[1]) {
            if (!uniqueTagsByType[tag[0]]) uniqueTagsByType[tag[0]] = new Set();
            uniqueTagsByType[tag[0]].add(tag[1]);
            allUniqueTags.add(tag[1]);
          }
        }
      }
    } catch (e) {
      error = "Failed to fetch notes.";
    } finally {
      loading = false;
    }
  }

  function getTitle(event: NDKEvent): string {
    // Try to get the title tag, else extract from content
    const titleTag = getMatchingTags(event, "title");
    if (titleTag.length > 0 && titleTag[0][1]) {
      return titleTag[0][1];
    }
    return getTitleTagForEvent(event.kind, event.content) || "Untitled";
  }

  function getTags(event: NDKEvent): [string, string][] {
    // Only return tags that have at least two elements
    return (event.tags || []).filter(
      (tag): tag is [string, string] => tag.length >= 2,
    );
  }

  function toggleTags(eventId: string) {
    showTags[eventId] = !showTags[eventId];
    // Force Svelte to update
    showTags = { ...showTags };
  }

  function toggleTagType(type: string) {
    if (selectedTagTypes.has(type)) {
      selectedTagTypes.delete(type);
    } else {
      selectedTagTypes.add(type);
    }
    // Force Svelte to update
    selectedTagTypes = new Set(selectedTagTypes);
    // Clear tag filter if tag type changes
    tagFilter = new Set();
  }

  function toggleTag(tag: string) {
    if (tagFilter.has(tag)) {
      tagFilter.delete(tag);
    } else {
      tagFilter.add(tag);
    }
    tagFilter = new Set(tagFilter);
  }

  function clearTagFilter() {
    tagFilter = new Set();
  }

  // Compute which tags to show in the filter
  $: tagsToShow = (() => {
    if (selectedTagTypes.size === 0) {
      return [];
    }
    let tags = new Set<string>();
    for (const type of selectedTagTypes) {
      for (const tag of uniqueTagsByType[type] || []) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  })();

  // Compute filtered events
  $: filteredEvents = (() => {
    if (selectedTagTypes.size === 0 && tagFilter.size === 0) {
      return events;
    }
    return events.filter((event) => {
      const tags = getTags(event);
      // If tag type(s) selected, only consider those tags
      const relevantTags =
        selectedTagTypes.size === 0
          ? tags
          : tags.filter((tag) => selectedTagTypes.has(tag[0]));
      // If tag filter is empty, show all events with relevant tags
      if (tagFilter.size === 0) {
        return relevantTags.length > 0;
      }
      // Otherwise, event must have at least one of the selected tags
      return relevantTags.some((tag) => tagFilter.has(tag[1]));
    });
  })();

  onMount(fetchMyNotes);
</script>

<div
  class="flex flex-col lg:flex-row w-full max-w-7xl mx-auto py-8 px-8 gap-8 lg:gap-24 min-w-0 overflow-hidden"
>
  <!-- Tag Filter Sidebar -->
  <aside class="w-full lg:w-80 flex-shrink-0 self-start">
    <h2 class="text-lg font-bold mb-4">Tag Type</h2>
    <div class="flex flex-wrap gap-2 mb-6">
      {#each tagTypes as type}
        <button
          class="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 transition-colors
            bg-amber-100 text-amber-900 hover:bg-amber-200
            {selectedTagTypes.has(type)
            ? 'border-2 border-amber-800'
            : 'border border-amber-200'}"
          on:click={() => toggleTagType(type)}
        >
          {#if type.length === 1}
            <span class="text-amber-400 font-mono">{type}</span>
            <span class="text-amber-900 font-normal">{tagTypeLabels[type]}</span
            >
          {:else}
            <span class="text-amber-900 font-mono">{type}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold">Tag Filter</h2>
      {#if tagsToShow.length > 0}
        <button
          class="ml-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600"
          on:click={clearTagFilter}
          disabled={tagFilter.size === 0}
        >
          Clear Tag Filter
        </button>
      {/if}
    </div>
    <div class="flex flex-wrap gap-2 mb-4">
      {#each tagsToShow as tag}
        <button
          class="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 transition-colors
            bg-amber-100 text-amber-900 hover:bg-amber-200
            {tagFilter.has(tag)
            ? 'border-2 border-amber-800'
            : 'border border-amber-200'}"
          on:click={() => toggleTag(tag)}
        >
          <span>{tag}</span>
        </button>
      {/each}
    </div>
  </aside>

  <!-- Notes Feed -->
  <div class="flex-1 w-full lg:max-w-5xl lg:ml-auto px-0 lg:px-4 min-w-0 overflow-hidden">
    <h1 class="text-2xl font-bold mb-6">My Notes</h1>
    {#if loading}
      <div class="text-gray-500">Loading…</div>
    {:else if error}
      <div class="text-red-500">{error}</div>
    {:else if filteredEvents.length === 0}
      <div class="text-gray-500">No notes found.</div>
    {:else}
      <ul class="space-y-4 w-full">
        {#each filteredEvents as event}
          <li class="p-4 bg-white dark:bg-gray-800 rounded shadow w-full overflow-hidden">
            <div class="flex items-center justify-between mb-2 min-w-0">
              <div class="font-semibold text-lg truncate flex-1 mr-2">{getTitle(event)}</div>
              <button
                class="flex-shrink-0 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                on:click={() => toggleTags(event.id)}
                aria-label="Show tags"
              >
                {showTags[event.id] ? "Hide Tags" : "Show Tags"}
              </button>
            </div>
            {#if showTags[event.id]}
              <div class="mb-2 text-xs flex flex-wrap gap-2">
                {#each getTags(event) as tag}
                  <span
                    class="bg-amber-900 text-amber-100 px-2 py-1 rounded-full text-xs font-medium flex items-baseline"
                  >
                    <span class="font-mono">{tag[0]}:</span>
                    <span>{tag[1]}</span>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="text-sm text-gray-400 mb-2">
              {event.created_at
                ? new Date(event.created_at * 1000).toLocaleString()
                : ""}
            </div>
            <div
              class="prose prose-sm dark:prose-invert max-w-none asciidoc-content overflow-x-auto break-words"
            >
              {@html renderedContent[event.id] || ""}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
