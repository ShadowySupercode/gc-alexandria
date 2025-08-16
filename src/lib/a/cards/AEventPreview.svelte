<script lang="ts">
  import { Card, Button } from "flowbite-svelte";
  import ViewPublicationLink from "$lib/components/util/ViewPublicationLink.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub, getMatchingTags } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { preventDefault } from "svelte/legacy";

  let {
    event,
    label = "",
    community = false,
    truncateContentAt = 200,
    showKind = true,
    showSummary = true,
    showDeferralNaddr = true,
    showPublicationLink = true,
    showContent = true,
    actions,
    onSelect,
    onDeferralClick
  }: {
    event: NDKEvent;
    label?: string;
    community?: boolean;
    truncateContentAt?: number;
    showKind?: boolean;
    showSummary?: boolean;
    showDeferralNaddr?: boolean;
    showPublicationLink?: boolean;
    showContent?: boolean;
    actions?: { label: string; onClick: (ev: NDKEvent) => void; variant?: "primary" | "light" | "alternative" }[];
    onSelect?: (ev: NDKEvent) => void;
    onDeferralClick?: (naddr: string, ev: NDKEvent) => void;
  } = $props();

  type ProfileData = {
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
  };

  function parseProfileContent(ev: NDKEvent): ProfileData | null {
    if (ev.kind !== 0 || !ev.content) {
      return null;
    }
    try {
      return JSON.parse(ev.content) as ProfileData;
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

  function clippedContent(content: string): string {
    if (!showContent) {
      return "";
    }
    if (!truncateContentAt || content.length <= truncateContentAt) {
      return content;
    }
    return content.slice(0, truncateContentAt) + "...";
  }

  function handleSelect(): void {
    onSelect?.(event);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect();
    }
  }

  function handleDeferralClick(e: MouseEvent): void {
    e.stopPropagation();
    if (deferralNaddr) {
      onDeferralClick?.(deferralNaddr, event);
    }
  }

  const displayName: string | undefined =
    profileData?.display_name || profileData?.name;
  const avatarFallback: string =
    (displayName || event.pubkey || "?").slice(0, 1).toUpperCase();
  const createdDate: string =
    event.created_at
      ? new Date(event.created_at * 1000).toLocaleDateString()
      : "Unknown date";

  const computedActions =
    actions && actions.length > 0
      ? actions
      : [
          {
            label: "Open",
            onClick: (ev: NDKEvent) => onSelect?.(ev),
            variant: "light" as const
          }
        ];
</script>

<Card
  class="hover:bg-highlight dark:bg-primary-900/70 bg-primary-50 dark:hover:bg-primary-800 border-primary-400 border-s-4 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-none"
  role="group"
  tabindex="0"
  aria-label="Event preview"
  onclick={handleSelect}
  onkeydown={handleKeydown}
  size="xl"
>
  <!-- Header -->
  <div class="flex items-start w-full p-4">
    <!-- Meta -->
    <div class="flex flex-row w-full gap-3 items-center min-w-0">
      {#if label}
          <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </span>
      {/if}
      {#if showKind}
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            Kind {event.kind}
          </span>
      {/if}
      {#if community}
          <span
            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
            title="Has posted to the community"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
            Community
          </span>
      {/if}
      <span class="text-xs ml-auto mb-4">
          {createdDate}
        </span>
    </div>

    <div class="flex flex-row">
      {@render userBadge(toNpub(event.pubkey) as string, displayName)}
    </div>
  </div>

  <!-- Body -->
  <div class="px-4 pb-3 flex flex-col gap-2">
    {#if event.kind === 0 && profileData?.about}
      <div class="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
        {clippedContent(profileData.about)}
      </div>
    {:else}
      {#if summary}
        <div class="text-sm text-primary-900 dark:text-primary-200 line-clamp-2">
          {summary}
        </div>
      {/if}
      {#if deferralNaddr}
        <div class="text-xs text-primary-800 dark:text-primary-300">
          Read
          <span
            class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all cursor-pointer"
            role="button"
            tabindex="0"
            onclick={handleDeferralClick}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDeferralClick(e as unknown as MouseEvent);
              }
            }}
          >
            {deferralNaddr}
          </span>
        </div>
      {/if}

      {#if showContent && event.content}
        <div class="text-sm text-gray-800 dark:text-gray-200 line-clamp-3 break-words mb-4">
          {clippedContent(event.content)}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Footer / Actions -->
  {#if showPublicationLink && event.kind !== 0}
    <div class="px-4 pt-2 pb-3 border-t border-primary-200 dark:border-primary-700 flex items-center gap-2 flex-wrap">
      <ViewPublicationLink {event} />
    </div>
  {/if}
</Card>
