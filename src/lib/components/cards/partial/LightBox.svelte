<script lang="ts">
  import { Img } from "flowbite-svelte";
  import { type ImageMeta } from "$lib/utils";

  export let images: ImageMeta[] = [];
  let selectedImage: ImageMeta | null = null;
  let showLightbox = false;

  function openLightbox(image: ImageMeta) {
    selectedImage = image;
    showLightbox = true;
  }

  function closeLightbox() {
    showLightbox = false;
    selectedImage = null;
  }
</script>

<section aria-label="Image gallery" class="grid grid-cols-2 md:grid-cols-3 gap-4">
  {#each images as image, i}
    <button
      class="cursor-pointer"
      on:click={() => openLightbox(image)}
      on:keydown={(e) => e.key === 'Enter' && openLightbox(image)}
      aria-label={`View image ${i + 1}`}>
        <Img
          src={image.url}
          alt={image.alt || `Gallery image ${i + 1}`}
          class="h-48 w-full object-cover rounded"
        />
        {#if image.alt}
          <p class="sr-only">{image.alt}</p>
        {/if}
    </button>
  {/each}
</section>

{#if showLightbox && selectedImage}
  <div
    class="fixed inset-0 bg-black bg-opacity-75 z-50 !m-0"
    role="dialog"
    aria-modal="true"
    aria-label="Image lightbox">
    <div class="h-full w-full flex flex-col items-center justify-center p-4">
      <button
        class="absolute top-4 right-4 text-white p-2"
        on:click={closeLightbox}
        aria-label="Close lightbox">
        ✕
      </button>
      <figure class="max-w-4xl max-h-[90vh]">
        <Img
          src={selectedImage.url}
          alt={selectedImage.alt || `Gallery image`}
          class="max-h-[90vh] w-auto"
        />
      </figure>
    </div>
  </div>
{/if}