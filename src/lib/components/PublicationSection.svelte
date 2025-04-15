<script lang='ts'>
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import { contentParagraph } from "$lib/snippets/PublicationSnippets.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import { getContext } from "svelte";

  let {
    address,
    rootAddress,
    ref,
  }: {
    address: string,
    rootAddress: string,
    ref: (ref: HTMLElement) => void,
  } = $props();

  const publicationTree = getContext<PublicationTree>('publicationTree');

  let sectionEvent = $derived.by(async () => await publicationTree.getEvent(address));
  let rootEvent = $derived.by(async () => await publicationTree.getEvent(rootAddress));
  let publicationType = $derived.by(async () =>
    (await rootEvent)?.getMatchingTags('type')[0]?.[1]);
  let hierarchy = $derived.by(async () => await publicationTree.getHierarchy(address));
  let depth = $derived.by(async () => (await hierarchy).length);

  let sectionRef: HTMLElement;

  $effect(() => {
    if (!sectionRef) {
      return;
    }

    ref(sectionRef);
  })
</script>

<!-- TODO: Correctly handle events that are the start of a content section. -->
<section bind:this={sectionRef}>
  {#await Promise.all([sectionEvent, publicationType])}
    <TextPlaceholder size='xxl' />
  {:then [sectionEvent, publicationType]}
    <!-- TODO: Gracefully handle nulls. -->
    {@render contentParagraph(sectionEvent?.content ?? '', publicationType ?? 'article', false)}
  {/await}
</section>

