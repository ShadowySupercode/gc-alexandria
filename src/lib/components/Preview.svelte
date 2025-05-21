<script lang='ts'>
  import { pharosInstance, SiblingSearchDirection } from '$lib/parser';
  import { Button, ButtonGroup, CloseButton, Input, P, Textarea, Tooltip } from 'flowbite-svelte';
  import { CaretDownSolid, CaretUpSolid, EditOutline } from 'flowbite-svelte-icons';
  import Self from './Preview.svelte';
  import { contentParagraph, sectionHeading } from '$lib/snippets/PublicationSnippets.svelte';
  import BlogHeader from "$components/cards/BlogHeader.svelte";
  import { getMatchingTags } from '$lib/utils/nostrUtils';

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
    index,
    sectionClass,
    publicationType,
    onBlogUpdate
  } = $props<{
    allowEditing?: boolean;
    depth?: number;
    isSectionStart?: boolean;
    needsUpdate?: boolean;
    oncursorcapture?: (e: MouseEvent) => void;
    oncursorrelease?: (e: MouseEvent) => void;
    parentId?: string | null | undefined;
    rootId: string;
    index: number;
    sectionClass?: string;
    publicationType?: string;
    onBlogUpdate?: any;
  }>();

  let currentContent: string = $state($pharosInstance.getContent(rootId));
  let title: string | undefined = $state($pharosInstance.getIndexTitle(rootId));
  let orderedChildren: string[] = $state($pharosInstance.getOrderedChildIds(rootId));

  let blogEntries = $state(Array.from($pharosInstance.getBlogEntries()));
  let metadata = $state($pharosInstance.getIndexMetadata());

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

  function getBlogEvent(index: number) {
      return blogEntries[index][1];
  }

  function byline(rootId: string, index: number) {
    console.log(rootId, index, blogEntries);
    const event = blogEntries[index][1];
    const author = event ? getMatchingTags(event, 'author')[0][1] : '';
    return author ?? "";
  }

  function hasCoverImage(rootId: string, index: number) {
    console.log(rootId);
    const event = blogEntries[index][1];
    const image = event && getMatchingTags(event, 'image')[0] ? getMatchingTags(event, 'image')[0][1] : '';
    return image ?? '';
  }

  function publishedAt(rootId: string, index: number) {
    console.log(rootId, index);
    console.log(blogEntries[index]);
    const event = blogEntries[index][1];
    const date = event.created_at ? new Date(event.created_at * 1000) : '';
    if (date !== '') {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date);
      return formattedDate ?? "";
    }
    return '';
  }

  function readBlog(rootId:string) {
    onBlogUpdate?.(rootId);
  }

  function propagateBlogUpdate(rootId:string) {
    onBlogUpdate?.(rootId);
  }

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
  {@const headingLevel = Math.min(depth + 1, 6)}
  {@const className = $pharosInstance.isFloatingTitle(rootId) ? 'discrete' : 'h-leather'}

  <svelte:element this={`h${headingLevel}`} class={className}>
    {title}
  </svelte:element>
{/snippet}

{#snippet coverImage(rootId: string, index: number, depth: number)}
  {#if hasCoverImage(rootId, index)}
    <div class="coverImage depth-{depth}">
      <img src={hasCoverImage(rootId, index)} alt={title} />
    </div>
  {/if}
{/snippet}

{#snippet blogMetadata(rootId: string, index: number)}
  <p class='h-leather'>
    by {byline(rootId, index)}
  </p>
  <p class='h-leather italic text-sm'>
    {publishedAt(rootId, index)}
  </p>
{/snippet}

{#snippet contentParagraph(content: string, publicationType: string)}
  {#if publicationType === 'novel'}
    <P class='whitespace-normal' firstupper={isSectionStart}>
      {@html content}
    </P>
  {:else if publicationType === 'blog'}
    <P class='whitespace-normal' firstupper={false}>
      {@html content}
    </P>
  {:else}
    <P class='whitespace-normal' firstupper={false}>
      {@html content}
    </P>
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
        {@render contentParagraph(currentContent, publicationType)}
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
        {#if !(publicationType === 'blog' && depth === 1)}
          {@render sectionHeading(title!, depth)}
        {/if}
      {/if}
      <!-- Recurse on child indices and zettels -->
      {#if publicationType === 'blog' && depth === 1}
        <BlogHeader event={getBlogEvent(index)} rootId={rootId} onBlogUpdate={readBlog} active={true} />
      {:else }
        {#key subtreeUpdateCount}
          {#each orderedChildren as id, index}
            <Self
              rootId={id}
              parentId={rootId}
              index={index}
              publicationType={publicationType}
              depth={depth + 1}
              {allowEditing}
              {sectionClass}
              isSectionStart={index === 0}
              bind:needsUpdate={subtreeNeedsUpdate}
              oncursorcapture={handleChildCursorCaptured}
              oncursorrelease={handleChildCursorReleased}
              onBlogUpdate={propagateBlogUpdate}
            />
          {/each}
        {/key}
      {/if}
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
