<script lang="ts">
  /**
   * @fileoverview AEventPreview Component - Alexandria
   *
   * A card component for displaying nostr event previews with configurable display options.
   * Shows event metadata, content, author information, and action buttons.
   *
   * @component
   * @category Cards
   *
   * @prop {NDKEvent} event - The nostr event to display (required)
   * @prop {string} [label=""] - Optional label/category for the event
   * @prop {boolean} [community=false] - Whether this is a community event
   * @prop {number} [truncateContentAt=200] - Character limit for content truncation
   * @prop {boolean} [showKind=true] - Whether to show event kind
   * @prop {boolean} [showSummary=true] - Whether to show event summary
   * @prop {boolean} [showDeferralNaddr=true] - Whether to show deferral naddr
   * @prop {boolean} [showPublicationLink=true] - Whether to show publication link
   * @prop {boolean} [showContent=true] - Whether to show event content
   * @prop {Array<{label: string, onClick: (ev: NDKEvent) => void, variant?: string}>} [actions] - Action buttons
   * @prop {(ev: NDKEvent) => void} [onSelect] - Callback when event is selected
   * @prop {(naddr: string, ev: NDKEvent) => void} [onDeferralClick] - Callback for deferral clicks
   *
   * @example
   * ```svelte
   * <AEventPreview
   *   {event}
   *   label="Article"
   *   showContent={true}
   *   actions={[{label: "View", onClick: handleView}]}
   * />
   * ```
   *
   * @example Basic event preview
   * ```svelte
   * <AEventPreview {event} />
   * ```
   *
   * @example Community event with actions
   * ```svelte
   * <AEventPreview
   *   {event}
   *   community={true}
   *   actions={[
   *     {label: "Reply", onClick: handleReply},
   *     {label: "Share", onClick: handleShare, variant: "light"}
   *   ]}
   * />
   * ```
   *
   * @example Minimal preview without content
   * ```svelte
   * <AEventPreview
   *   {event}
   *   showContent={false}
   *   showSummary={false}
   *   truncateContentAt={100}
   * />
   * ```
   *
   * @features
   * - Responsive card layout with author badges
   * - Content truncation with "show more" functionality
   * - Publication links and metadata display
   * - Configurable action buttons
   * - Community event highlighting
   * - Event kind and summary display
   *
   * @accessibility
   * - Semantic card structure
   * - Keyboard accessible action buttons
   * - Screen reader friendly metadata
   * - Proper heading hierarchy
   */

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
    onDeferralClick,
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
    actions?: {
      label: string;
      onClick: (ev: NDKEvent) => void;
      variant?: "primary" | "light" | "alternative";
    }[];
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
  const avatarFallback: string = (displayName || event.pubkey || "?")
    .slice(0, 1)
    .toUpperCase();
  const createdDate: string = event.created_at
    ? new Date(event.created_at * 1000).toLocaleDateString()
    : "Unknown date";

  const computedActions =
    actions && actions.length > 0
      ? actions
      : [
          {
            label: "Open",
            onClick: (ev: NDKEvent) => onSelect?.(ev),
            variant: "light" as const,
          },
        ];
</script>

<Card
  class="event-preview-card"
  role="group"
  tabindex={0}
  aria-label="Event preview"
  onclick={handleSelect}
  onkeydown={handleKeydown}
  size="xl"
>
  <!-- Header -->
  <div class="card-header">
    <!-- Meta -->
    <div class="flex flex-row w-full gap-3 items-center min-w-0">
      {#if label}
        <span class="event-label">
          {label}
        </span>
      {/if}
      {#if showKind}
        <span class="event-kind-badge">
          Kind {event.kind}
        </span>
      {/if}
      {#if community}
        <span class="community-badge" title="Has posted to the community">
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
  <div class="card-body">
    {#if event.kind === 0 && profileData?.about}
      <div class="card-about">
        {clippedContent(profileData.about)}
      </div>
    {:else}
      {#if summary}
        <div class="card-summary">
          {summary}
        </div>
      {/if}
      {#if deferralNaddr}
        <div class="text-xs text-primary-800 dark:text-primary-300">
          Read
          <span
            class="deferral-link"
            role="button"
            tabindex="0"
            onclick={handleDeferralClick}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
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
        <div class="card-content">
          {clippedContent(event.content)}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Footer / Actions -->
  {#if showPublicationLink && event.kind !== 0}
    <div class="card-footer">
      <ViewPublicationLink {event} />
    </div>
  {/if}
</Card>
