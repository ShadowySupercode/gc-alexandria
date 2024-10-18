<script lang="ts">
  import { parser } from "$lib/parser";
  import { Button, Heading, P, Textarea, Tooltip } from "flowbite-svelte";
  import { CaretDownSolid, CaretUpSolid, EditOutline } from "flowbite-svelte-icons";
  import { createEventDispatcher } from "svelte";

  // TODO: Push parser to state to be read on reload.

  export let sectionClass: string = '';
  export let isSectionStart: boolean = false;
  export let rootId: string;
  export let depth: number = 0;
  export let allowEditing: boolean = false;

  const dispatch = createEventDispatcher();

  let isEditing: boolean = false;
  let currentContent: string = $parser.getContent(rootId);
  let hasCursor: boolean = false;
  let childHasCursor: boolean;

  const title = $parser.getIndexTitle(rootId);
  const orderedChildren = $parser.getOrderedChildIds(rootId);

  $: buttonsVisible = hasCursor && !childHasCursor;

  const getHeadingTag = (depth: number) => {
    switch (depth) {
    case 0:
      return "h2";
    case 1:
      return "h3";
    case 2:
      return "h4";
    case 3:
      return "h5";
    case 4:
      return "h6";
    }
  };

  const handleMouseEnter = (e: MouseEvent) => {
    hasCursor = true;
    dispatch('cursorcapture', e);
  };

  const handleMouseLeave = (e: MouseEvent) => {
    hasCursor = false;
    dispatch('cursorrelease', e);
  };

  const handleChildCursorCaptured = (e: MouseEvent) => {
    childHasCursor = true;
    dispatch('cursorrelase', e);
  };

  const handleChildCursorReleased = (e: MouseEvent) => {
    childHasCursor = false;
  }

  const toggleEditing = (id: string, shouldSave: boolean = true) => {
    const editing = isEditing;

    if (editing && shouldSave) {
      $parser.updateEventContent(id, currentContent);
    }

    isEditing = !editing;
  };
</script>

<!-- This component is recursively structured.  The base case is single block of content. -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<section
  id={rootId}
  class={`note-leather w-full flex space-x-2 justify-between ${sectionClass}`}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
>
  <!-- Zettel base case -->
  {#if orderedChildren.length === 0 || depth >= 4}
    {#if isEditing}
      <form class='w-full'>
        <Textarea class='textarea-leather w-full' bind:value={currentContent}>
          <div slot='footer' class='flex space-x-2 justify-end'>
            <Button
              type='reset'
              class='btn-leather min-w-fit'
              size='sm'
              outline
              on:click={() => toggleEditing(rootId, false)}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              class='btn-leather min-w-fit'
              size='sm'
              solid
              on:click={() => toggleEditing(rootId, true)}
            >
              Save
            </Button>
          </div>
        </Textarea>
      </form>
    {:else}
      <P firstupper={isSectionStart}>
        {@html currentContent}
      </P>
    {/if}
  {:else}
    <div class='flex flex-col space-y-2'>
      <Heading tag={getHeadingTag(depth)} class='h-leather'>
        {title}
      </Heading>
      <!-- Recurse on child indices and zettels -->
      {#each orderedChildren as id, index}
        <svelte:self
          rootId={id}
          depth={depth + 1}
          {allowEditing}
          isSectionStart={index === 0}
          on:cursorcapture={handleChildCursorCaptured}
          on:cursorrelease={handleChildCursorReleased}
        />
      {/each}
    </div>
  {/if}
  {#if allowEditing}
    <div class={`flex flex-col space-y-2 justify-start ${buttonsVisible ? 'visible' : 'invisible'}`}>
      <Button class='btn-leather' size='sm' outline>
        <CaretUpSolid />
      </Button>
      <Button class='btn-leather' size='sm' outline>
        <CaretDownSolid />
      </Button>
      <Button class='btn-leather' size='sm' outline on:click={() => toggleEditing(rootId)}>
        <EditOutline />
      </Button>
      <Tooltip class='tooltip-leather' type='auto' placement='top'>
        Edit
      </Tooltip>
    </div>
  {/if}
</section>
