<script lang="ts">
/**
 * @fileoverview AAlert Component - Alexandria
 *
 * A themed alert component based on Flowbite's Alert with consistent styling.
 * Provides notifications, warnings, and informational messages with optional dismissal.
 *
 * @component
 * @category Primitives
 *
 * @prop {string} [color] - Alert color theme (success, warning, error, info, etc.)
 * @prop {boolean} [dismissable] - Whether alert can be dismissed by user
 * @prop {snippet} children - Main alert content (required)
 * @prop {snippet} [title] - Optional title section
 * @prop {string} [classes] - Additional CSS classes to apply
 *
 * @example
 * ```svelte
 * <AAlert color="success" dismissable={true}>
 *   {#snippet title()}Success!{/snippet}
 *   {#snippet children()}Your changes have been saved.{/snippet}
 * </AAlert>
 * ```
 *
 * @example Simple alert
 * ```svelte
 * <AAlert color="info">
 *   {#snippet children()}This is an informational message.{/snippet}
 * </AAlert>
 * ```
 *
 * @example Alert with title and custom classes
 * ```svelte
 * <AAlert color="warning" classes="mt-4" dismissable={true}>
 *   {#snippet title()}Warning{/snippet}
 *   {#snippet children()}Please check your input.{/snippet}
 * </AAlert>
 * ```
 *
 * @features
 * - Consistent "leather" theme styling
 * - Built on Flowbite Alert component
 * - Support for custom colors and dismissal
 * - Flexible content with title and body sections
 *
 * @accessibility
 * - Inherits Flowbite's accessibility features
 * - Proper ARIA attributes for alerts
 * - Keyboard accessible dismiss button when dismissable
 */

  import { Alert } from "flowbite-svelte";

  let { color, dismissable, children, title, classes } = $props<{
    color?: string;
    dismissable?: boolean;
    children?: any;
    title?: any;
    classes?: string;
  }>();
</script>

<Alert {color} {dismissable} class="alert-leather mb-4 {classes}">
  {#if title}
    <div class="flex">
      <span class="text-lg font-medium">{@render title()}</span>
    </div>
  {/if}
  {@render children()}
</Alert>
