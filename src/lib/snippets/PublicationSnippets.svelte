<script module lang="ts">
  import { P } from "flowbite-svelte";

  export { contentParagraph, sectionHeading };
</script>

{#snippet sectionHeading(title: string, depth: number)}
  {@const headingLevel = Math.min(depth + 1, 6)}

  <!-- TODO: Handle floating titles. -->
  <svelte:element this={`h${headingLevel}`} class="h-leather">
    {title}
  </svelte:element>
{/snippet}

{#snippet contentParagraph(
  content: string,
  publicationType: string,
  isSectionStart: boolean,
)}
  <section class="whitespace-normal publication-leather">
    {@html content}
  </section>
{/snippet}
