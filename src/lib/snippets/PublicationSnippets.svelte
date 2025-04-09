<script module lang='ts'>
  import { P } from 'flowbite-svelte';

  export { contentParagraph, sectionHeading };
</script>

{#snippet sectionHeading(title: string, depth: number)}
  {#if depth === 0}
    <h1 class='h-leather'>
      {title}
    </h1>
  {:else if depth === 1}
    <h2 class='h-leather'>
      {title}
    </h2>
  {:else if depth === 2}
    <h3 class='h-leather'>
      {title}
    </h3>
  {:else if depth === 3}
    <h4 class='h-leather'>
      {title}
    </h4>
  {:else if depth === 4}
    <h5 class='h-leather'>
      {title}
    </h5>
  {:else}
    <h6 class='h-leather'>
      {title}
    </h6>
  {/if}
{/snippet}

{#snippet contentParagraph(content: string, publicationType: string, isSectionStart: boolean)}
  {#if publicationType === 'novel'}
    <P class='whitespace-normal' firstupper={isSectionStart}>
      {@html content}
    </P>
  {:else}
    <P class='whitespace-normal' firstupper={false}>
      {@html content}
    </P>
  {/if}
{/snippet}
