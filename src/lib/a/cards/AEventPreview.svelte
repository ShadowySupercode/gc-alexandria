<script lang="ts">
  import { Card } from "flowbite-svelte";
  import ViewPublicationLink from "$lib/components/util/ViewPublicationLink.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub, getMatchingTags } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "$lib/utils/nostrUtils";

  // AI-NOTE: 2025-08-16 - AEventPreview centralizes display logic for search result cards
  // Used for primary search results (profiles or events). Extend cautiously for other contexts.
  let {
    event,
    index,
    label = "",
    community = false,
    truncateContentAt = 200,
    showKind = true,
    showSummary = true,
    showDeferralNaddr = true,
    showPublicationLink = true,
    onSelect
  }: {
    event: NDKEvent;
    index?: number;
    label?: string;
    community?: boolean|string;
    truncateContentAt?: number;
    showKind?: boolean;
    showSummary?: boolean;
    showDeferralNaddr?: boolean;
    showPublicationLink?: boolean;
    onSelect?: (ev: NDKEvent) => void;
  } = $props();

  // Parse kind 0 profile JSON
  function parseProfileContent(ev: NDKEvent): {
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
  } | null {
    if (ev.kind !== 0 || !ev.content) {
      return null;
    }
    try {
      return JSON.parse(ev.content);
    } catch {
      return null;
    }
  }

  function getSummary(ev: NDKEvent): string | undefined {
    return getMatchingTags(ev, "summary")[0]?.[1];
  }

  function getDeferralNaddr(ev: NDKEvent): string | undefined {
    return getMatchingTags(ev, "deferral")[0]?.[1];
  }

  const profileData = parseProfileContent(event);
  const summary = showSummary ? getSummary(event) : undefined;
  const deferralNaddr = showDeferralNaddr ? getDeferralNaddr(event) : undefined;

  function handleSelect(): void {
    onSelect?.(event);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect();
    }
  }

  function clippedContent(content: string): string {
    if (!truncateContentAt || content.length <= truncateContentAt) {
      return content;
    }
    return content.slice(0, truncateContentAt) + "...";
  }
</script>

<Card
  class="card"
  role="button"
  tabindex="0"
  onclick={handleSelect}
  onkeydown={handleKeydown}
>
  <div class="flex flex-col gap-1 p-4">
    <div class="flex items-center gap-2 mb-1">
      {#if label}
        <span class="font-medium text-gray-800 dark:text-gray-100">{label}</span>
      {/if}
      {#if showKind}
        <span class="text-xs text-gray-600 dark:text-gray-400">Kind: {event.kind}</span>
      {/if}
      {#if community}
        <div
          class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
          title="Has posted to the community"
        >
          <svg
            class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      {:else}
        <div class="flex-shrink-0 w-4 h-4"></div>
      {/if}
      <span class="text-xs text-gray-600 dark:text-gray-400">
        {@render userBadge(
          toNpub(event.pubkey) as string,
          profileData?.display_name || profileData?.name
        )}
      </span>
      <span class="text-xs text-gray-500 dark:text-gray-400 ml-auto">
        {event.created_at
          ? new Date(event.created_at * 1000).toLocaleDateString()
          : "Unknown date"}
      </span>
    </div>

    {#if event.kind === 0 && profileData}
      <div class="flex items-center gap-3 mb-2">
        {#if profileData.picture}
          <img
            src={profileData.picture}
            alt="Profile"
            class="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
            onerror={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        {:else}
          <div
            class="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center border border-gray-200 dark:border-gray-600"
          >
            <span class="text-lg font-medium text-gray-600 dark:text-gray-300">
              {(profileData.display_name || profileData.name || event.pubkey.slice(0, 1)).toUpperCase()}
            </span>
          </div>
        {/if}
        <div class="flex flex-col min-w-0 flex-1">
          {#if profileData.display_name || profileData.name}
            <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
              {profileData.display_name || profileData.name}
            </span>
          {/if}
          {#if profileData.about}
            <span class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {profileData.about}
            </span>
          {/if}
        </div>
      </div>
    {:else}
      {#if summary}
        <div class="text-sm text-primary-900 dark:text-primary-200 mb-1 line-clamp-2">
          {summary}
        </div>
      {/if}
      {#if deferralNaddr}
        <div class="text-xs text-primary-800 dark:text-primary-300 mb-1">
          Read
          <span
            class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all cursor-pointer"
            onclick={(e) => {
              e.stopPropagation();
              // Parent should intercept navigation by listening onSelect and inspecting event tags if needed
            }}
          >
            {deferralNaddr}
          </span>
        </div>
      {/if}
      {#if showPublicationLink}
        <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">
          <ViewPublicationLink event={event} />
        </div>
      {/if}
      {#if event.content}
        <div class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words">
          {clippedContent(event.content)}
        </div>
      {/if}
    {/if}
  </div>
</Card>
