<script lang='ts'>
  import Preview from "$lib/components/Preview.svelte";
  import { pharosInstance } from "$lib/parser";
  import { Heading } from "flowbite-svelte";

  let treeNeedsUpdate: boolean = false;
  let treeUpdateCount: number = 0;
  let someIndexValue = 0;

  $: {
    if (treeNeedsUpdate) {
      treeUpdateCount++;
    }
  }
</script>

<div class='w-full flex justify-center'>
  <main class='main-leather flex flex-col space-y-4 max-w-2xl w-full mt-4 mb-4'>
    <Heading tag='h1' class='h-leather mb-2'>Compose</Heading>
    {#key treeUpdateCount}
      <Preview rootId={$pharosInstance.getRootIndexId()} allowEditing={true} bind:needsUpdate={treeNeedsUpdate} index={someIndexValue} />
    {/key}
  </main>
</div>
