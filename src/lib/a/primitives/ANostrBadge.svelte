<script lang="ts">
  /**
   * @fileoverview ANostrBadge Component - Alexandria
   *
   * Displays a nostr badge (NIP-58) with image or fallback text representation.
   * Shows badge thumbnails with proper sizing and accessibility features.
   *
   * @component
   * @category Primitives
   *
   * @prop {DisplayBadge} badge - Badge object containing title, thumbUrl, etc. (required)
   * @prop {"xs" | "s" | "m" | "l"} [size="s"] - Badge size (xs: 16px, s: 24px, m: 32px, l: 48px)
   *
   * @example
   * ```svelte
   * <ANostrBadge {badge} size="m" />
   * ```
   *
   * @example Badge with image
   * ```svelte
   * <ANostrBadge badge={{title: "Developer", thumbUrl: "/badge.png"}} size="l" />
   * ```
   *
   * @example Badge without image (shows first letter)
   * ```svelte
   * <ANostrBadge badge={{title: "Contributor"}} size="s" />
   * ```
   *
   * @example In a list of badges
   * ```svelte
   * {#each userBadges as badge}
   *   <ANostrBadge {badge} size="xs" />
   * {/each}
   * ```
   *
   * @typedef {Object} DisplayBadge
   * @property {string} title - Badge title
   * @property {string} [thumbUrl] - Optional thumbnail URL
   *
   * @features
   * - Displays badge thumbnail image when available
   * - Fallback to first letter of title when no image
   * - Multiple size options for different contexts
   * - Lazy loading for performance
   * - Proper aspect ratio and object-fit
   *
   * @accessibility
   * - Alt text for badge images
   * - Title attribute for hover information
   * - Proper semantic structure
   * - Loading and decoding optimizations
   */

  import type { DisplayBadge } from "$lib/nostr/nip58";

  let { badge, size = "s" }: { badge: DisplayBadge; size?: "xs" | "s" | "m" | "l" } = $props();
  const px = { xs: 16, s: 24, m: 32, l: 48 }[size];
</script>

<span class="inline-flex items-center" title={badge.title}>
  {#if badge.thumbUrl}
    <img
      src={badge.thumbUrl}
      alt={badge.title}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      class="rounded-md border border-muted/20 object-cover"
    />
  {:else}
    <span
      class="grid place-items-center rounded-md border border-muted/20 bg-surface text-xs"
      style={`width:${px}px;height:${px}px`}
    >
      {badge.title.slice(0, 1)}
    </span>
  {/if}
</span>
