<script lang="ts">
  import { Heading, Textarea, Toolbar, ToolbarButton, Tooltip } from "flowbite-svelte";
  import { CodeOutline, EyeSolid, PaperPlaneOutline } from "flowbite-svelte-icons";
  import Preview from "$lib/components/Preview.svelte";
  import Pharos, { pharosInstance } from "$lib/parser";
  import { ndkInstance } from "$lib/ndk";
  import { goto } from "$app/navigation";

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

<div class="edit-container">
  <main class="edit-main">
    <Heading tag="h1" class="heading-1 mb-2">Edit</Heading>
    {#if isEditing}
      <form class="form-base">
        <Textarea
          id="article-content"
          class="form-textarea"
          rows={8}
          placeholder="Write AsciiDoc content"
          bind:value={editorText}
        >
          <Toolbar slot="header" embedded>
            <ToolbarButton name="Preview" on:click={showPreview}>
              <EyeSolid class="w-6 h-6" />
            </ToolbarButton>
            <ToolbarButton name="Review" slot="end" on:click={prepareReview}>
              <PaperPlaneOutline class="w=6 h-6 rotate-90" />
            </ToolbarButton>
          </Toolbar>
        </Textarea>
      </form>
    {:else}
      <form class="edit-preview-form">
        <Toolbar class="edit-preview-toolbar">
          <ToolbarButton name="Edit" on:click={hidePreview}>
            <CodeOutline class="w-6 h-6" />
          </ToolbarButton>
          <ToolbarButton name="Review" slot="end" on:click={prepareReview}>
            <PaperPlaneOutline class="w=6 h-6 rotate-90" />
          </ToolbarButton>
        </Toolbar>
        {#if rootIndexId}
          <Preview sectionClass="m-2" rootId={rootIndexId} />
        {/if}
      </form>
    {/if}
  </main>
</div>
