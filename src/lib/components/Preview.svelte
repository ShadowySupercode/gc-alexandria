<script lang='ts'>
  import { pharosInstance, SiblingSearchDirection } from '$lib/parser';
  import { Button, ButtonGroup, CloseButton, Input, P, Textarea, Tooltip } from 'flowbite-svelte';
  import { CaretDownSolid, CaretUpSolid, EditOutline } from 'flowbite-svelte-icons';
  import Self from './Preview.svelte';

  // TODO: Fix move between parents.

  let {
    allowEditing,
    depth = 0,
    isSectionStart,
    needsUpdate = $bindable<boolean>(),
    oncursorcapture, 
    oncursorrelease,
    parentId,
    rootId,
    sectionClass,
  } = $props<{
    allowEditing?: boolean;
    depth?: number;
    isSectionStart?: boolean;
    needsUpdate?: boolean;
    oncursorcapture?: (e: MouseEvent) => void;
    oncursorrelease?: (e: MouseEvent) => void;
    parentId?: string | null | undefined;
    rootId: string;
    sectionClass?: string;
  }>();

  let currentContent: string = $state($pharosInstance.getContent(rootId));
  let title: string | undefined = $state($pharosInstance.getIndexTitle(rootId));
  let orderedChildren: string[] = $state($pharosInstance.getOrderedChildIds(rootId));

  let isEditing: boolean = $state(false);
  let hasCursor: boolean = $state(false);
  let childHasCursor: boolean = $state(false);

  let hasPreviousSibling: boolean = $state(false);
  let hasNextSibling: boolean = $state(false);

  let subtreeNeedsUpdate: boolean = $state(false);
  let updateCount: number = $state(0);
  let subtreeUpdateCount: number = $state(0);

  let buttonsVisible: boolean = $derived(hasCursor && !childHasCursor);

  $effect(() => {
    if (needsUpdate) {
      updateCount++;
      needsUpdate = false;
      title = $pharosInstance.getIndexTitle(rootId);
      currentContent = $pharosInstance.getContent(rootId);
    }

    if (subtreeNeedsUpdate) {
      subtreeUpdateCount++;
      subtreeNeedsUpdate = false;

      const prevChildCount = orderedChildren.length;
      orderedChildren = $pharosInstance.getOrderedChildIds(rootId);
      const newChildCount = orderedChildren.length;

      // If the number of children has changed, a child has been added or removed, and a child may
      // have been moved into a different subtree.  Due to the `needsUpdate` binding in the
      // component's recursion, setting `needsUpdate` to true will force the parent to rerender its
      // subtree.
      if (newChildCount !== prevChildCount) {
        needsUpdate = true;
      }
    }
  });

  $effect(() => {
    if (parentId && allowEditing) {
      // Check for previous/next siblings on load
      const previousSibling = $pharosInstance.getNearestSibling(rootId, depth - 1, SiblingSearchDirection.Previous);
      const nextSibling = $pharosInstance.getNearestSibling(rootId, depth - 1, SiblingSearchDirection.Next);
      
      // Hide arrows if no siblings exist
      hasPreviousSibling = !!previousSibling[0];
      hasNextSibling = !!nextSibling[0];
    }
  });

  function handleMouseEnter(e: MouseEvent) {
    hasCursor = true;
    if (oncursorcapture) {
      oncursorcapture(e);
    }
  }

  function handleMouseLeave(e: MouseEvent) {
    hasCursor = false;
    if (oncursorrelease) {
      oncursorrelease(e);
    }
  }

  function handleChildCursorCaptured(e: MouseEvent) {
    childHasCursor = true;
    if (oncursorcapture) {
      oncursorcapture(e);
    }
  }

  function handleChildCursorReleased(e: MouseEvent) {
    childHasCursor = false;
  }

  function toggleEditing(id: string, shouldSave: boolean = true) {
    const editing = isEditing;

    if (editing && shouldSave) {
      if (orderedChildren.length > 0) {

      }

      $pharosInstance.updateEventContent(id, currentContent);
    }

    isEditing = !editing;
  }

  function moveUp(rootId: string, parentId: string) {
    // Get the previous sibling and its index
    const [prevSiblingId, prevIndex] = $pharosInstance.getNearestSibling(rootId, depth - 1, SiblingSearchDirection.Previous);
    if (!prevSiblingId || prevIndex == null) {
      return;
    }

    // Move the current event before the previous sibling.
    $pharosInstance.moveEvent(rootId, prevSiblingId, false);
    needsUpdate = true;
  };

  function moveDown(rootId: string, parentId: string) {
    // Get the next sibling and its index 
    const [nextSiblingId, nextIndex] = $pharosInstance.getNearestSibling(rootId, depth - 1, SiblingSearchDirection.Next);
    if (!nextSiblingId || nextIndex == null) {
      return;
    }

    // Move the current event after the next sibling
    $pharosInstance.moveEvent(rootId, nextSiblingId, true);
    needsUpdate = true;
  }
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

<!-- This component is recursively structured.  The base case is single block of content. -->
<section
  id={rootId}
  class={`note-leather flex space-x-2 justify-between text-wrap break-words ${sectionClass}`}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  aria-label='Publication section'
>
  <!-- Zettel base case -->
  {#if orderedChildren.length === 0 || depth >= 4}
    {#key updateCount}
      {#if isEditing}
        <form class='w-full'>
          <Textarea class='textarea-leather w-full whitespace-normal' bind:value={currentContent}>
            <div slot='footer' class='flex space-x-2 justify-end'>
              <Button
                type='reset'
                class='btn-leather min-w-fit'
                size='sm'
                outline
                onclick={() => toggleEditing(rootId, false)}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                class='btn-leather min-w-fit'
                size='sm'
                onclick={() => toggleEditing(rootId, true)}
              >
                Save
              </Button>
            </div>
          </Textarea>
        </form>
      {:else}
        <P class='whitespace-normal' firstupper={isSectionStart}>
          {@html currentContent}
        </P>
      {/if}
    {/key}
  {:else}
    <div class='flex flex-col space-y-2 w-full'>
      {#if isEditing}
        <ButtonGroup class='w-full'>
          <Input type='text' class='input-leather' size='lg' bind:value={title}>
            <CloseButton slot='right' onclick={() => toggleEditing(rootId, false)} />
          </Input>
          <Button class='btn-leather' color='primary' size='lg' onclick={() => toggleEditing(rootId, true)}>
            Save
          </Button>
        </ButtonGroup>
      {:else}
        {@render sectionHeading(title!, depth)}
      {/if}
      <!-- Recurse on child indices and zettels -->
      {#key subtreeUpdateCount}
        {#each orderedChildren as id, index}
          <Self
            rootId={id}
            parentId={rootId}
            depth={depth + 1}
            {allowEditing}
            {sectionClass}
            isSectionStart={index === 0}
            bind:needsUpdate={subtreeNeedsUpdate}
            oncursorcapture={handleChildCursorCaptured}
            oncursorrelease={handleChildCursorReleased}
          />
        {/each}
      {/key}
    </div>
  {/if}
  {#if allowEditing && depth > 0}
    <div class={`flex flex-col space-y-2 justify-start ${buttonsVisible ? 'visible' : 'invisible'}`}>
      {#if hasPreviousSibling && parentId}
        <Button class='btn-leather' size='sm' outline onclick={() => moveUp(rootId, parentId)}>
          <CaretUpSolid />
        </Button>
      {/if}
      {#if hasNextSibling && parentId}
        <Button class='btn-leather' size='sm' outline onclick={() => moveDown(rootId, parentId)}>
          <CaretDownSolid />
        </Button>
      {/if}
      <Button class='btn-leather' size='sm' outline onclick={() => toggleEditing(rootId)}>
        <EditOutline />
      </Button>
      <Tooltip class='tooltip-leather' type='auto' placement='top'>
        Edit
      </Tooltip>
    </div>
  {/if}
</section>
