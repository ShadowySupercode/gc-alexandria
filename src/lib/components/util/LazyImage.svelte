<script lang="ts">
  import { generateDarkPastelColor } from '$lib/utils/image_utils';
  import { fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let {
    src,
    alt,
    eventId,
    className = 'w-full h-full object-cover',
    placeholderClassName = '',
  }: {
    src: string;
    alt: string;
    eventId: string;
    className?: string;
    placeholderClassName?: string;
  } = $props();

  let imageLoaded = $state(false);
  let imageError = $state(false);
  let imgElement = $state<HTMLImageElement | null>(null);

  const placeholderColor = $derived.by(() => generateDarkPastelColor(eventId));

  function loadImage() {
    if (!imgElement) return;
    
    imgElement.onload = () => {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        imageLoaded = true;
      }, 100);
    };
    
    imgElement.onerror = () => {
      imageError = true;
    };
    
    // Set src after setting up event handlers
    imgElement.src = src;
  }

  function bindImg(element: HTMLImageElement) {
    imgElement = element;
    // Load image immediately when element is bound
    loadImage();
  }
</script>

<div class="relative w-full h-full">
  <!-- Placeholder -->
  <div 
    class="absolute inset-0 {placeholderClassName}"
    style="background-color: {placeholderColor};"
    class:hidden={imageLoaded}
  >
  </div>

  <!-- Image -->
  <img
    bind:this={imgElement}
    {src}
    {alt}
    class="{className} {imageLoaded ? 'opacity-100' : 'opacity-0'}"
    style="transition: opacity 0.2s ease-out;"
    loading="lazy"
    decoding="async"
    class:hidden={imageError}
    onload={() => {
      setTimeout(() => {
        imageLoaded = true;
      }, 100);
    }}
    onerror={() => {
      imageError = true;
    }}
  />

  <!-- Error state -->
  {#if imageError}
    <div 
      class="absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 {placeholderClassName}"
    >
      <div class="text-gray-500 dark:text-gray-400 text-xs">
        Failed to load
      </div>
    </div>
  {/if}
</div> 