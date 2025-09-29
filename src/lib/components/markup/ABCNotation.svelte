<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';

  let {
    abc = $bindable(),
    showControls = false,
    responsive = true,
    scale = 1.0
  } = $props();

  let paperDiv: HTMLDivElement;
  let visualObj: any;
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let abcjs: any = null;

  /**
   * AI-NOTE: Lazy load abcjs library only when component is mounted.
   * This reduces initial bundle size and improves page load performance.
   */
  onMount(async () => {
    try {
      // Dynamic import for code splitting
      abcjs = await import('abcjs');

      // AI-NOTE: Wait for DOM to be ready and paperDiv to be bound
      await tick();

      renderMusic();
      isLoading = false;
    } catch (err) {
      console.error('[ABCNotation] Failed to load abcjs:', err);
      error = 'Failed to load music notation library';
      isLoading = false;
    }
  });

  /**
   * Renders ABC notation as sheet music using abcjs
   * AI-NOTE: Uses renderAbc from abcjs to generate SVG sheet music.
   * The visualObj return value contains information about the rendered tune
   * but is not used in Phase 1 (will be needed for audio playback in Phase 2).
   */
  function renderMusic() {
    if (!abcjs || !paperDiv) return;
    if (!abc || abc.trim() === '') return;

    try {
      // AI-NOTE: Leave enough margin for titles and clefs on the left
      const availableWidth = paperDiv.clientWidth;
      const staffWidth = Math.max(300, availableWidth - 80);

      visualObj = abcjs.renderAbc(paperDiv, abc, {
        responsive: responsive ? 'resize' : undefined,
        scale,
        add_classes: true,
        staffwidth: staffWidth,
        viewportHorizontal: false,
        paddingtop: 15,
        paddingbottom: 30,
        paddingleft: 15,
        paddingright: 15
      })[0];
      error = null;
    } catch (err) {
      console.error('[ABCNotation] Failed to render:', err);
      error = 'Failed to render music notation. Please check ABC syntax.';
    }
  }

  /**
   * AI-NOTE: React to changes in the abc prop using Svelte 5's $effect rune.
   * This allows dynamic updates if the ABC content changes after initial render.
   */
  $effect(() => {
    if (abcjs && abc && paperDiv) {
      renderMusic();
    }
  });

  onDestroy(() => {
    // AI-NOTE: No cleanup needed in Phase 1. In Phase 2+, we'll need to
    // clean up audio resources (AudioContext, synth) here.
  });
</script>

<div class="abc-notation-wrapper my-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
  {#if isLoading}
    <div class="flex items-center justify-center p-8">
      <p class="text-gray-600 dark:text-gray-400">Loading music notation...</p>
    </div>
  {/if}
  {#if error}
    <div class="flex items-center justify-center p-8">
      <p class="text-red-600 dark:text-red-400">{error}</p>
    </div>
  {/if}
  <div bind:this={paperDiv} class="abc-notation-paper" class:hidden={isLoading || error}></div>
</div>

<style>
  .abc-notation-wrapper {
    max-width: 100%;
    overflow-x: auto;
  }

  .abc-notation-paper {
    min-height: 100px;
  }

  /* AI-NOTE: abcjs generates SVG elements with specific classes.
   * These styles ensure proper rendering and responsiveness. */
  :global(.abc-notation-paper svg) {
    max-width: 100%;
    height: auto;
  }
</style>