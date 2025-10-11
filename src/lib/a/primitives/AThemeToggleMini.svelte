<script lang="ts">
/**
 * @fileoverview AThemeToggleMini Component - Alexandria
 *
 * A compact theme selector dropdown that allows users to switch between available themes.
 * Integrates with the themeStore to persist and apply theme changes across the app.
 * This component has no props - it manages its own state internally.
 *
 * @component
 * @category Primitives
 *
 * @example
 * ```svelte
 * <AThemeToggleMini />
 * ```
 *
 * @example Place in navigation or settings area
 * ```svelte
 * <div class="flex items-center gap-4">
 *   <span>Appearance:</span>
 *   <AThemeToggleMini />
 * </div>
 * ```
 *
 * @features
 * - Dropdown with radio buttons for theme selection
 * - Automatic persistence via themeStore
 * - Shows current theme in button label
 * - Available themes: Light, Ocean, Forest
 * - Instant theme application on selection
 *
 * @accessibility
 * - Keyboard accessible dropdown navigation
 * - Radio buttons for clear selection state
 * - Screen reader friendly with proper labels
 * - Focus management within dropdown
 *
 * @integration
 * - Works with Alexandria's theme system
 * - Automatically applies CSS custom properties
 * - Persists selection in localStorage
 * - Updates all themed components instantly
 */

  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { Button, Dropdown, DropdownGroup, Radio } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { setTheme, theme as themeStore } from "$lib/stores/themeStore";

  let theme = $state<string>("light");

  onMount(() => {
    return themeStore.subscribe((v) => (theme = String(v)));
  });

  // Persist and apply whenever the selection changes
  $effect(() => {
    setTheme(theme);
  });
</script>

<Button>
  Theme {theme}<ChevronDownOutline class="ms-2 inline h-6 w-6" />
</Button>
<Dropdown simple class="w-44">
  <DropdownGroup class="space-y-3 p-3">
    <li>
      <Radio name="group1" bind:group={theme} value="light">Light</Radio>
    </li>
    <li>
      <Radio name="group1" bind:group={theme} value="ocean">Ocean</Radio>
    </li>
    <li>
      <Radio name="group1" bind:group={theme} value="forrest">Forrest</Radio>
    </li>
  </DropdownGroup>
</Dropdown>
