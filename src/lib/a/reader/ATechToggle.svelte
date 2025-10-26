<script lang="ts">
/**
 * @fileoverview ATechToggle Component - Alexandria
 *
 * A toggle switch that controls the visibility of technical details throughout the app.
 * Works in conjunction with ATechBlock components to show/hide nostr-specific developer information.
 *
 * @component
 * @category Reader
 *
 * @example
 * ```svelte
 * <ATechToggle />
 * ```
 *
 * @features
 * - Persists setting in localStorage via techStore
 * - Accessible with ARIA labels and keyboard navigation
 * - Automatically updates all ATechBlock components when toggled
 * - Useful for nostr developers who want to see raw event data and technical details
 *
 * @accessibility
 * - Uses proper ARIA labeling
 * - Keyboard accessible (Space/Enter to toggle)
 * - Screen reader friendly with descriptive label
 */

  import { showTech } from "$lib/stores/techStore.ts";
  import { Toggle, P } from "flowbite-svelte";
  let label = "Show technical details";
</script>

<div class="inline-flex items-center gap-2 select-none my-3">
  <Toggle bind:checked={$showTech} aria-label={label} />
  <P class="text-sm">{label}</P>
</div>
