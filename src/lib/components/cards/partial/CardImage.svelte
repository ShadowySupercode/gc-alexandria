<script lang="ts">
  import { Img } from "flowbite-svelte";

  const {
    imageUrl,
    title,
    useFallbackColor = true,
  } = $props<{
    imageUrl?: string;
    title: string;
    useFallbackColor?: boolean;
  }>();

  let imageError = $state(false);

  // Function to generate a pastel color from a string
  function generatePastelColor(str: string): string {
    if (!str || str === "Untitled") str = "Default";

    // Generate a hash of the string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert to HSL and ensure it's pastel (high lightness, low-medium saturation)
    // Using the hash for hue (0-360), keeping saturation and lightness in pastel range
    const hue = Math.abs(hash % 360);
    const saturation = 60 + (hash % 20); // 60-80%
    const lightness = 80 + (hash % 10); // 80-90%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // Generate background color from title
  const bgColor = $derived.by(() => generatePastelColor(title));
</script>

<div class="flex justify-center align-middle max-h-40 overflow-hidden">
  {#if imageUrl && !imageError}
    <Img
      src={imageUrl}
      alt={title || "Publication cover"}
      class="rounded w-full h-full object-cover"
      onerror={() => (imageError = true)}
    />
  {:else if useFallbackColor}
    <div
      class="rounded w-full h-40 flex"
      style="background-color: {bgColor};"
    ></div>
  {/if}
</div>
