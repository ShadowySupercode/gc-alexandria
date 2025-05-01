<script lang="ts">
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { Card, Img } from "flowbite-svelte";
  import InlineProfile from "$components/util/InlineProfile.svelte";
    import { HeartOutline } from 'flowbite-svelte-icons';

  const { rootId, event, onBlogUpdate } = $props<{ rootId: String, event: NDKEvent, onBlogUpdate?: any;  }>();

  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(event.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let image: string = $derived(event.getMatchingTags('image')[0]?.[1] ?? null);
  let authorPubkey: string = $derived(event.getMatchingTags('p')[0]?.[1] ?? null);

  let likeCount = 0;
  

  function publishedAt() {
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

  function showBlog() {
    onBlogUpdate?.(rootId);
  }
</script>

{#if title != null}
  <Card class='ArticleBox card-leather w-xl flex flex-col'>
    <div class='flex flex-col space-y-2'>
      <div class="flex flex-row justify-between my-2">
        <InlineProfile pubkey={authorPubkey} title={author} />
        <span class='text-gray-500'>{publishedAt()}</span>
      </div>
      {#if image}
      <div class="flex col justify-center">
        <Img src={image} class="rounded w-full h-full object-cover"/>
      </div>
      {/if}
      <div class='flex flex-col flex-grow space-y-4'>
        <button onclick={() => showBlog()} class='text-left'>
          <h2 class='text-lg font-bold line-clamp-2' title="{title}">{title}</h2>
        </button>
        <button class="underline text-right" onclick={() => showBlog()} >Read all about it...</button>
      </div>
      <div class='flex flex-row bg-primary-50'>
        <div class='InteractiveMenu flex flex-row'>
          <div class='flex flex-row shrink-0'><HeartOutline /><span>{likeCount}</span></div>
          <div class='flex flex-row shrink-0'><HeartOutline /><span>{likeCount}</span></div>
          <div class='flex flex-row shrink-0'><HeartOutline /><span>{likeCount}</span></div>
          <div class='flex flex-row shrink-0'><HeartOutline /><span>{likeCount}</span></div>
          <div class='flex flex-row shrink-0'><HeartOutline /><span>{likeCount}</span></div>

        </div>
      </div>
    </div>
  </Card>
{/if}
