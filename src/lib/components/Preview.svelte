<script lang="ts">
  import { pharosInstance, SiblingSearchDirection } from "$lib/parser";
  import {
    Button,
    ButtonGroup,
    CloseButton,
    Input,
    P,
    Textarea,
    Tooltip,
  } from "flowbite-svelte";
  import {
    CaretDownSolid,
    CaretUpSolid,
    EditOutline,
  } from "flowbite-svelte-icons";
  import Self from "./Preview.svelte";
  import BlogHeader from "$components/cards/BlogHeader.svelte";
  import type { NostrEvent } from '$lib/types/nostr';
  import { getTagValue } from '$lib/utils/eventUtils';

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
    onBlogUpdate,
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
  let orderedChildren: string[] = $state(
    $pharosInstance.getOrderedChildIds(rootId),
  );

  let type = $derived.by(() => getTagValue(index, 'type') ?? '');
  let blogEntries = $state(Array.from($pharosInstance.getBlogEntries()).filter(([_, event]) => event !== null) as [string, NostrEvent][]);

  let isEditing: boolean = $state(false);
  let hasCursor: boolean = $state(false);
  let childHasCursor: boolean = $state(false);

  let canEdit = $derived.by(() => allowEditing && !childHasCursor);

  let hasPreviousSibling = $derived.by(() => {
    if (!parentId || !allowEditing) return false;
    const previousSibling = $pharosInstance.getNearestSibling(
      rootId,
      depth - 1,
      SiblingSearchDirection.Previous,
    );
    return !!previousSibling[0];
  });

  let hasNextSibling = $derived.by(() => {
    if (!parentId || !allowEditing) return false;
    const nextSibling = $pharosInstance.getNearestSibling(
      rootId,
      depth - 1,
      SiblingSearchDirection.Next,
    );
    return !!nextSibling[0];
  });

  let updateTrigger = $state(0);
  let subtreeUpdateTrigger = $state(0);
  let updateCount = $derived.by(() => updateTrigger);
  let subtreeUpdateCount = $derived.by(() => subtreeUpdateTrigger);
  let subtreeNeedsUpdate = $derived.by(() => needsUpdate);

  let buttonsVisible: boolean = $derived.by(() => hasCursor && !childHasCursor);

  let blogEvent = $derived.by(() => blogEntries[index]?.[1]);
  let blogAuthor = $derived.by(() =>
    blogEvent ? (getTagValue(blogEvent, "author") ?? "") : "",
  );
  let blogImage = $derived.by(() =>
    blogEvent ? (getTagValue(blogEvent, "image") ?? "") : "",
  );
  let blogPublishedAt = $derived.by(() => {
    if (!blogEvent?.created_at) return "";
    const date = new Date(blogEvent.created_at * 1000);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  });

  $effect(() => {
    if (needsUpdate) {
      updateTrigger++;
      needsUpdate = false;
      title = $pharosInstance.getIndexTitle(rootId);
      currentContent = $pharosInstance.getContent(rootId);
    }

    if (subtreeNeedsUpdate) {
      subtreeUpdateTrigger++;
      subtreeNeedsUpdate = false;

      const prevChildCount = orderedChildren.length;
      orderedChildren = $pharosInstance.getOrderedChildIds(rootId);
      const newChildCount = orderedChildren.length;

      if (newChildCount !== prevChildCount) {
        needsUpdate = true;
      }
    }
  });

  function getBlogEvent(index: number) {
    return blogEvent;
  }

  function readBlog(rootId: string) {
    onBlogUpdate?.(rootId);
  }

  function propagateBlogUpdate(rootId: string) {
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
    const [prevSiblingId, prevIndex] = $pharosInstance.getNearestSibling(
      rootId,
      depth - 1,
      SiblingSearchDirection.Previous,
    );
    if (!prevSiblingId || prevIndex == null) {
      return;
    }

    // Move the current event before the previous sibling.
    $pharosInstance.moveEvent(rootId, prevSiblingId, false);
    needsUpdate = true;
  }

  function moveDown(rootId: string, parentId: string) {
    // Get the next sibling and its index
    const [nextSiblingId, nextIndex] = $pharosInstance.getNearestSibling(
      rootId,
      depth - 1,
      SiblingSearchDirection.Next,
    );
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
  {@const className = $pharosInstance.isFloatingTitle(rootId)
    ? "discrete"
    : "h-leather"}

  <svelte:element this={`h${headingLevel}`} class={className}>
    {title}
  </svelte:element>
{/snippet}

{#snippet contentParagraph(content: string, publicationType: string)}
  {#if publicationType === "novel"}
    <P class="whitespace-normal" firstupper={isSectionStart}>
      {@html content}
    </P>
  {:else if publicationType === "blog"}
    <P class="whitespace-normal" firstupper={false}>
      {@html content}
    </P>
  {:else}
    <P class="whitespace-normal" firstupper={false}>
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
  aria-label="Publication section"
>
  <!-- Section base case -->
  {#if orderedChildren.length === 0 || depth >= 4}
    {#key updateCount}
      {#if isEditing}
        <form class="w-full">
          <Textarea
            class="textarea-leather w-full whitespace-normal"
            bind:value={currentContent}
          >
            <div slot="footer" class="flex space-x-2 justify-end">
              <Button
                type="reset"
                class="btn-leather min-w-fit"
                size="sm"
                outline
                onclick={() => toggleEditing(rootId, false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                class="btn-leather min-w-fit"
                size="sm"
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
    <div class="flex flex-col space-y-2 w-full">
      {#if isEditing}
        <ButtonGroup class="w-full">
          <Input type="text" class="input-leather" size="lg" bind:value={title}>
            <CloseButton
              slot="right"
              onclick={() => toggleEditing(rootId, false)}
            />
          </Input>
          <Button
            class="btn-leather"
            color="primary"
            size="lg"
            onclick={() => toggleEditing(rootId, true)}
          >
            Save
          </Button>
        </ButtonGroup>
      {:else if !(publicationType === "blog" && depth === 1)}
        {@render sectionHeading(title!, depth)}
      {/if}
      <!-- Recurse on child indices and Sections -->
      {#if publicationType === "blog" && depth === 1}
        <BlogHeader
          event={getBlogEvent(index)}
          {rootId}
          onBlogUpdate={readBlog}
          active={true}
        />
      {:else}
        {#key subtreeUpdateCount}
          {#each orderedChildren as id, index}
            <Self
              rootId={id}
              parentId={rootId}
              {index}
              {publicationType}
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
    <div
      class={`flex flex-col space-y-2 justify-start ${buttonsVisible ? "visible" : "invisible"}`}
    >
      {#if hasPreviousSibling && parentId}
        <Button
          class="btn-leather"
          size="sm"
          outline
          onclick={() => moveUp(rootId, parentId)}
        >
          <CaretUpSolid />
        </Button>
      {/if}
      {#if hasNextSibling && parentId}
        <Button
          class="btn-leather"
          size="sm"
          outline
          onclick={() => moveDown(rootId, parentId)}
        >
          <CaretDownSolid />
        </Button>
      {/if}
      <Button
        class="btn-leather"
        size="sm"
        outline
        onclick={() => toggleEditing(rootId)}
      >
        <EditOutline />
      </Button>
      <Tooltip class="tooltip-leather" type="auto" placement="top">
        Edit
      </Tooltip>
    </div>
  {/if}
</section>
