<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { scale } from "svelte/transition";
  import { Card, Button, Popover } from "flowbite-svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import { quintOut } from "svelte/easing";
  import CardActions from "$components/util/CardActions.svelte";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import LazyImage from "$components/util/LazyImage.svelte";
  import { generateDarkPastelColor } from "$lib/utils/image_utils";
  import { getNdkContext } from "$lib/ndk";
  import { deleteEvent } from "$lib/services/deletion";
  import {
    EyeOutline,
    EyeSlashOutline,
    DotsVerticalOutline,
  } from "flowbite-svelte-icons";

  const {
    rootId,
    event,
    onBlogUpdate,
    active = true,
    showActionsMenu = false,
    commentsVisible = false,
    highlightsVisible = false,
    onToggleComments,
    onToggleHighlights,
  } = $props<{
    rootId: string;
    event: NDKEvent;
    onBlogUpdate?: any;
    active: boolean;
    showActionsMenu?: boolean;
    commentsVisible?: boolean;
    highlightsVisible?: boolean;
    onToggleComments?: () => void;
    onToggleHighlights?: () => void;
  }>();

  const ndk = getNdkContext();

  /**
   * Handle deletion of this blog article
   */
  async function handleDelete() {
    const confirmed = confirm(
      "Are you sure you want to delete this article? This action will publish a deletion request to all relays."
    );

    if (!confirmed) return;

    try {
      await deleteEvent({
        eventAddress: event.tagAddress(),
        eventKind: event.kind,
        reason: "User deleted article",
        onSuccess: (deletionEventId) => {
          console.log("[BlogHeader] Deletion event published:", deletionEventId);
          // Call onBlogUpdate if provided to refresh the list
          if (onBlogUpdate) {
            onBlogUpdate();
          }
        },
        onError: (error) => {
          console.error("[BlogHeader] Deletion failed:", error);
          alert(`Failed to delete article: ${error}`);
        },
      }, ndk);
    } catch (error) {
      console.error("[BlogHeader] Deletion error:", error);
    }
  }

  let title: string = $derived(event.getMatchingTags("title")[0]?.[1]);
  let author: string = $derived(
    getMatchingTags(event, "author")[0]?.[1] ?? "unknown",
  );
  let image: string = $derived(event.getMatchingTags("image")[0]?.[1] ?? null);
  let authorPubkey: string = $derived(
    event.getMatchingTags("p")[0]?.[1] ?? null,
  );
  let hashtags: string = $derived(event.getMatchingTags("t") ?? null);

  function publishedAt() {
    const date = event.created_at ? new Date(event.created_at * 1000) : "";
    if (date !== "") {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date);
      return formattedDate ?? "";
    }
    return "";
  }

  function showBlog() {
    onBlogUpdate?.(rootId);
  }

  let actionsMenuOpen = $state(false);
</script>

{#if title != null}
  {#if active}
    <!-- Full card view when active -->
    <div
      class="ArticleBox card-leather w-full grid active cursor-pointer min-w-0"
      role="button"
      tabindex={0}
      onclick={(e: MouseEvent) => {
        // Don't trigger if clicking on CardActions or its children
        const target = e.target as HTMLElement;
        if (target.closest('.card-actions') || target.closest('button[type="button"]')) {
          return;
        }
        showBlog();
      }}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement;
          if (!target.closest('.card-actions') && !target.closest('button[type="button"]')) {
            showBlog();
          }
        }
      }}
    >
      <Card class="w-full h-full min-w-0 !max-w-none">
      <div class="space-y-4 relative pl-4 min-w-0 w-full">
        <div class="flex flex-row justify-between my-2">
          <div class="flex flex-col">
            {@render userBadge(authorPubkey, author, ndk)}
            <span class="text-gray-700 dark:text-gray-300">{publishedAt()}</span>
          </div>
          {#if showActionsMenu}
            <div class="flex items-center">
              <Button
                type="button"
                class="btn-leather !p-1 bg-primary-50 dark:bg-gray-800"
                outline
                onmouseenter={() => (actionsMenuOpen = true)}
              >
                <DotsVerticalOutline class="w-5 h-5" />
              </Button>
              {#if actionsMenuOpen}
                <Popover
                  id="popover-blog-actions"
                  placement="bottom-end"
                  trigger="click"
                  class="popover-leather w-fit z-10"
                  onmouseleave={() => (actionsMenuOpen = false)}
                >
                  <div class="flex flex-row justify-between space-x-4">
                    <div class="flex flex-col text-nowrap">
                      <ul class="space-y-2">
                        <li>
                          <button
                            class="btn-leather w-full text-left"
                            onclick={() => {
                              onToggleComments?.();
                              actionsMenuOpen = false;
                            }}
                          >
                            {#if commentsVisible}
                              <EyeSlashOutline class="inline mr-2" />
                              Hide Comments
                            {:else}
                              <EyeOutline class="inline mr-2" />
                              Show Comments
                            {/if}
                          </button>
                        </li>
                        <li>
                          <button
                            class="btn-leather w-full text-left"
                            onclick={() => {
                              onToggleHighlights?.();
                              actionsMenuOpen = false;
                            }}
                          >
                            {#if highlightsVisible}
                              <EyeSlashOutline class="inline mr-2" />
                              Hide Highlights
                            {:else}
                              <EyeOutline class="inline mr-2" />
                              Show Highlights
                            {/if}
                          </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Popover>
              {/if}
            </div>
          {/if}
        </div>

        <div
          class="ArticleBoxImage flex justify-center items-center p-2 h-40 -mt-2"
          in:scale={{ start: 0.8, duration: 500, delay: 100, easing: quintOut }}
        >
          {#if image}
            <LazyImage 
              src={image} 
              alt={title || "Publication image"}
              eventId={event.id}
              className="rounded w-full h-full object-cover"
            />
          {:else}
            <div 
              class="rounded w-full h-full"
              style="background-color: {generateDarkPastelColor(event.id)};"
            >
            </div>
          {/if}
        </div>
        
        <div class="flex flex-col space-y-4">
          <h2 class="text-lg font-bold line-clamp-2" {title}>{title}</h2>
          {#if hashtags}
            <div class="tags">
              {#each hashtags as tag}
                <span>#{tag}</span>
              {/each}
            </div>
          {/if}
        </div>
        
        <Interactions {rootId} {event} />
        
        <!-- Position CardActions at bottom-right -->
        <div 
          class="absolute bottom-2 right-2 card-actions"
          role="button"
          tabindex={0}
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.stopPropagation()}
        >
          <CardActions {event} onDelete={handleDelete} />
        </div>
      </div>
      </Card>
    </div>
  {:else}
    <!-- Simple list view when collapsed -->
    <div
      class="py-2 pl-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      role="button"
      tabindex="0"
      onclick={() => showBlog()}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          showBlog();
        }
      }}
    >
      <h3 class="text-base font-medium text-gray-900 dark:text-white">{title}</h3>
      <div class="flex items-center gap-2 mt-1">
        <p class="text-sm text-gray-500 dark:text-gray-400">{publishedAt()}</p>
        <span class="text-sm text-gray-400 dark:text-gray-500">•</span>
        <p class="text-sm text-gray-500 dark:text-gray-400">{author}</p>
      </div>
    </div>
  {/if}
{/if}
