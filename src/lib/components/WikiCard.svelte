<script lang="ts">
  import { Card } from "flowbite-svelte";
  import InlineProfile from "$components/util/InlineProfile.svelte";

  let { title, pubhex, eventId, summary, urlPath, hashtags = [] } = $props<{
    title: string;
    pubhex: string;
    eventId: string;
    summary: string;
    urlPath: string;
    hashtags?: string[];
  }>();
</script>

<Card class='ArticleBox card-leather w-lg flex flex-row space-x-2'>
  <div class='col flex flex-row flex-grow space-x-4'>
    <div class="flex flex-col flex-grow">
      <a href="/wiki?id={urlPath}" class='flex flex-col space-y-2'>
        <h2 class='text-lg font-bold line-clamp-2' title={title}>{title}</h2>
        <div class="flex flex-col space-y-1">
          <h3 class='text-base font-normal'>
            by <InlineProfile pubkey={pubhex} />
          </h3>
          {#if summary}
            <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{summary}</p>
          {/if}
          {#if hashtags.length}
            <div class="flex flex-wrap gap-2 mt-2">
              {#each hashtags as tag}
                <span class="px-2 py-1 rounded bg-primary-100 text-primary-700 text-xs font-semibold">#{tag}</span>
              {/each}
            </div>
          {/if}
        </div>
      </a>
    </div>
  </div>
</Card> 