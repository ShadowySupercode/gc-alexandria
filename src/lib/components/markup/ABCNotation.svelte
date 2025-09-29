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

  // AI-NOTE: Phase 2 - Audio playback state
  let synth: any = null;
  let audioContext: AudioContext | null = null;
  let isPlaying = $state(false);
  let isAudioLoading = $state(false);
  let audioInitialized = $state(false);

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
   * AI-NOTE: Phase 2 - Initialize audio synthesis
   * Creates AudioContext and synth instance. Must be called from user interaction.
   */
  async function initAudio() {
    if (!abcjs || !visualObj || audioInitialized) return;

    try {
      isAudioLoading = true;

      // AI-NOTE: AudioContext must be created from user interaction (browser security)
      audioContext = new AudioContext();
      synth = new abcjs.synth.CreateSynth();

      // Initialize synth with audio context
      await synth.init({
        audioContext,
        visualObj: visualObj,
        options: {
          soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
          // Use the default "FluidR3_GM" sound font
        }
      });

      // Prime the synth (prepare audio buffers)
      await synth.prime();

      audioInitialized = true;
      isAudioLoading = false;
    } catch (err) {
      console.error('[ABCNotation] Failed to initialize audio:', err);
      error = 'Failed to initialize audio playback';
      isAudioLoading = false;
    }
  }

  /**
   * AI-NOTE: Phase 2 - Toggle play/pause
   */
  async function togglePlayback() {
    if (!audioInitialized) {
      // First time playing - initialize audio
      await initAudio();
      if (!audioInitialized) return; // Init failed
    }

    if (isPlaying) {
      // Pause playback
      synth.pause();
      isPlaying = false;
    } else {
      // Start or resume playback
      if (synth) {
        synth.start();
        isPlaying = true;

        // AI-NOTE: Listen for playback end to reset state
        // abcjs doesn't have a built-in ended event, so we'll handle it via timing
      }
    }
  }

  /**
   * AI-NOTE: React to changes in the abc prop using Svelte 5's $effect rune.
   * This allows dynamic updates if the ABC content changes after initial render.
   */
  $effect(() => {
    if (abcjs && abc && paperDiv) {
      renderMusic();
      // Reset audio when ABC content changes
      audioInitialized = false;
      isPlaying = false;
      if (synth) {
        synth.stop?.();
      }
    }
  });

  onDestroy(() => {
    // AI-NOTE: Phase 2 - Clean up audio resources
    if (synth) {
      synth.stop?.();
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
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

  <!-- AI-NOTE: Phase 2 - Audio controls -->
  {#if showControls && !isLoading && !error}
    <div class="flex items-center justify-center mb-4">
      <button
        onclick={togglePlayback}
        disabled={isAudioLoading}
        class="px-6 py-2 rounded-lg font-medium transition-colors
               bg-blue-600 hover:bg-blue-700 text-white
               disabled:bg-gray-400 disabled:cursor-not-allowed
               flex items-center gap-2"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {#if isAudioLoading}
          <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading audio...
        {:else if isPlaying}
          <!-- Pause icon -->
          <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
          </svg>
          Pause
        {:else}
          <!-- Play icon -->
          <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Play
        {/if}
      </button>
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