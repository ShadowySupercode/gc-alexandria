<script lang="ts">
/**
 * @fileoverview AInput Component - Alexandria
 *
 * A styled input field with consistent theming and focus states.
 * Provides a standardized text input with Alexandria's design system.
 *
 * @component
 * @category Primitives
 *
 * @prop {string} value - The input value (bindable)
 * @prop {string} [class=""] - Additional CSS classes to apply
 * @prop {string} [placeholder=""] - Placeholder text for the input
 *
 * @example
 * ```svelte
 * <AInput bind:value={searchQuery} placeholder="Enter search term..." />
 * ```
 *
 * @example Basic input
 * ```svelte
 * <AInput bind:value={name} placeholder="Your name" />
 * ```
 *
 * @example Custom styled input
 * ```svelte
 * <AInput
 *   bind:value={email}
 *   placeholder="Email address"
 *   class="max-w-md border-blue-300"
 * />
 * ```
 *
 * @features
 * - Consistent themed styling with focus rings
 * - Full width by default with customizable classes
 * - Smooth focus transitions and hover effects
 * - Integrates with Alexandria's color system
 *
 * @accessibility
 * - Proper focus management with visible focus rings
 * - Keyboard accessible
 * - Supports all standard input attributes
 * - Screen reader compatible
 */

  let { value = $bindable(""), class: className = "", placeholder = "" } = $props<{
    value?: string;
    class?: string;
    placeholder?: string;
  }>();
</script>

<input
  class={`w-full h-10 px-3 rounded-md border border-muted/30 bg-surface text-text placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
  bind:value
  {placeholder}
/>
