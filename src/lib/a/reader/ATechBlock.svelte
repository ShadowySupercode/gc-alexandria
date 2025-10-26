<script lang="ts">
/**
 * @fileoverview ATechBlock Component - Alexandria
 *
 * A collapsible container for technical details that can be shown/hidden based on user preference.
 * Works with the ATechToggle component and techStore to manage visibility of developer information.
 *
 * @component
 * @category Reader
 *
 * @prop {string} [title="Technical details"] - The title shown when block is hidden
 * @prop {string} [className=""] - Additional CSS classes to apply
 * @prop {snippet} content - The technical content to show/hide (required)
 *
 * @example
 * ```svelte
 * <ATechBlock title="Raw Event Data">
 *   {#snippet content()}
 *     <pre>{JSON.stringify(event, null, 2)}</pre>
 *   {/snippet}
 * </ATechBlock>
 * ```
 *
 * @example Custom title and styling
 * ```svelte
 * <ATechBlock title="Event JSON" className="border-red-200">
 *   {#snippet content()}
 *     <code>{eventData}</code>
 *   {/snippet}
 * </ATechBlock>
 * ```
 *
 * @features
 * - Respects global showTech setting from techStore
 * - Individual reveal button when globally hidden
 * - Accessible with proper ARIA attributes
 * - Useful for hiding nostr event data, debug info, etc.
 *
 * @accessibility
 * - Keyboard accessible reveal button
 * - Screen reader friendly with descriptive labels
 * - Proper semantic HTML structure
 */

  import { showTech } from "$lib/stores/techStore.ts";
  let revealed = $state(false);
  let { title = "Technical details", className = "", content } = $props();

  let hidden = $derived(!$showTech && !revealed);
</script>

{#if hidden}
  <div
    class="rounded-md border border-dashed border-muted/40 bg-surface/60 px-3 py-2 my-6 flex items-center gap-3 {className}"
  >
    <span class="text-xs opacity-70">{title} hidden</span>
    <button
      class="ml-auto text-sm underline hover:no-underline"
      onclick={() => (revealed = true)}>Reveal this block</button
    >
  </div>
{:else}
  {@render content()}
{/if}
