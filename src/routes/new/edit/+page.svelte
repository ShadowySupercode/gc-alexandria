<script lang="ts">
  import { Heading, Textarea, Toolbar, ToolbarButton, Tooltip } from "flowbite-svelte";
  import { CodeOutline, EyeSolid, PaperPlaneOutline } from "flowbite-svelte-icons";
  import Preview from "$lib/components/Preview.svelte";
  import Pharos, { pharosInstance } from "$lib/parser";
  import { ndkInstance } from "$lib/ndk";
  import { goto } from "$app/navigation";
  let someIndexValue = 0;

  // TODO: Prompt user to sign in before editing.

  let isEditing: boolean = true;
  let rootIndexId: string;

  let editorText: string;

  const showPreview = () => {
    try {
      $pharosInstance ??= new Pharos($ndkInstance);
      $pharosInstance.reset();
      $pharosInstance.parse(editorText);
    } catch (e) {
      console.error(e);
      // TODO: Indicate error in UI.
      return;
    }

    rootIndexId = $pharosInstance.getRootIndexId();
    isEditing = false;
  };

  const hidePreview = () => {
    isEditing = true;
  };

  const prepareReview = () => {
    try {
      $pharosInstance.reset();
      $pharosInstance.parse(editorText);
    } catch (e) {
      console.error(e);
      // TODO: Indicate error in UI.
      return;
    }

    $pharosInstance.generate($ndkInstance.activeUser?.pubkey!);
    goto('/new/compose');
  }
</script>

<div class='w-full flex justify-center'>
  <main class='main-leather flex flex-col space-y-4 max-w-2xl w-full mt-4 mb-4'>
    <Heading tag='h1' class='h-leather mb-2'>Edit</Heading>
    {#if isEditing}
      <form>
        <Textarea
          id='article-content'
          class='textarea-leather'
          rows={8}
          placeholder='Write AsciiDoc content'
          bind:value={editorText}
        >
          <Toolbar slot='header' embedded>
            <ToolbarButton name='Preview' on:click={showPreview}>
              <EyeSolid class='w-6 h-6' />
            </ToolbarButton>
            <ToolbarButton name='Review' slot='end' on:click={prepareReview}>
              <PaperPlaneOutline class='w=6 h-6 rotate-90' />
            </ToolbarButton>
          </Toolbar>
        </Textarea>
      </form>
    {:else}
      <form class='border border-gray-400 dark:border-gray-600 rounded-lg flex flex-col space-y-2 h-fit'>
        <Toolbar class='toolbar-leather rounded-b-none bg-gray-200 dark:bg-gray-800'>
          <ToolbarButton name='Edit' on:click={hidePreview}>
            <CodeOutline class='w-6 h-6' />
          </ToolbarButton>
          <ToolbarButton name='Review' slot='end' on:click={prepareReview}>
            <PaperPlaneOutline class='w=6 h-6 rotate-90' />
          </ToolbarButton>
        </Toolbar>
        {#if rootIndexId}
          <Preview sectionClass='m-2' rootId={rootIndexId} index={someIndexValue} />
        {/if}
      </form>
    {/if}
  </main>
</div>
