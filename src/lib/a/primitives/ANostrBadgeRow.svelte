<script lang="ts">
/**
 * @fileoverview ANostrBadgeRow Component - Alexandria
 *
 * Displays a horizontal row of nostr badges with optional limit and overflow indicator.
 * Uses ANostrBadge components to render individual badges in a flex layout.
 *
 * @component
 * @category Primitives
 *
 * @prop {DisplayBadge[]} [badges=[]] - Array of badge objects to display
 * @prop {"xs" | "s" | "m" | "l"} [size="s"] - Size for all badges in the row
 * @prop {number} [limit=6] - Maximum number of badges to show before truncating
 *
 * @example
 * ```svelte
 * <ANostrBadgeRow badges={userBadges} size="m" limit={4} />
 * ```
 *
 * @example Show all badges
 * ```svelte
 * <ANostrBadgeRow badges={allBadges} limit={999} />
 * ```
 *
 * @example Limited display with small badges
 * ```svelte
 * <ANostrBadgeRow badges={userBadges} size="xs" limit={3} />
 * ```
 *
 * @example Profile header with medium badges
 * ```svelte
 * <ANostrBadgeRow badges={profileBadges} size="m" limit={5} />
 * ```
 *
 * @features
 * - Responsive flex layout with wrapping
 * - Configurable display limit with overflow counter
 * - Consistent spacing between badges
 * - Shows "+N" indicator when badges exceed limit
 * - Uses badge.def.id as key for efficient rendering
 *
 * @accessibility
 * - Inherits accessibility from ANostrBadge components
 * - Clear visual hierarchy with proper spacing
 * - Overflow indicator provides context about hidden badges
 */

  import type { DisplayBadge } from "$lib/nostr/nip58";
  import ANostrBadge from "./ANostrBadge.svelte";

  let { badges = [], size = "s", limit = 6 }: { badges?: DisplayBadge[]; size?: "xs" | "s" | "m" | "l"; limit?: number } = $props();
  const shown = () => badges.slice(0, limit);
</script>

<div class="flex flex-wrap gap-1.5 items-center">
  {#each shown() as b (b.def.id)}
    <ANostrBadge badge={b} {size} />
  {/each}
  {#if badges.length > limit}
    <span
      class="text-[10px] px-1.5 py-0.5 rounded-md border border-muted/30 bg-surface/70"
    >
      +{badges.length - limit}
    </span>
  {/if}
</div>
