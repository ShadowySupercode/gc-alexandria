<script lang="ts">
  import { ndkInstance } from '$lib/ndk';
  import { naddrEncode } from '$lib/utils';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { standardRelays } from '../consts';
  import { Card, Img } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import InlineProfile from "$components/util/InlineProfile.svelte";

  const { event } = $props<{ event: NDKEvent }>();

  const relays = $derived.by(() => {
    return $ndkInstance.activeUser?.relayUrls ?? standardRelays;
  });

  const href = $derived.by(() => {
    const d = event.getMatchingTags('d')[0]?.[1];
    if (d != null) {
        return `publication?d=${d}`;
    } else {
        return `publication?id=${naddrEncode(event, relays)}`;
    }
  }
);

  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(event.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let version: string = $derived(event.getMatchingTags('version')[0]?.[1] ?? '1');
  let image: string = $derived(event.getMatchingTags('image')[0]?.[1] ?? null);
  let authorPubkey: string = $derived(event.getMatchingTags('p')[0]?.[1] ?? null);

</script>

{#if title != null && href != null}
  <Card class='ArticleBox card-leather max-w-md flex flex-row space-x-2'>
    {#if image}
    <div class="flex col justify-center align-middle max-h-36 max-w-24 overflow-hidden">
      <Img src={image} class="rounded w-full h-full object-cover"/>
    </div>
    {/if}
    <div class='col flex flex-row flex-grow space-x-4'>
      <div class="flex flex-col flex-grow">
        <a href="/{href}" class='flex flex-col space-y-2'>
          <h2 class='text-lg font-bold line-clamp-2' title="{title}">{title}</h2>
          <h3 class='text-base font-normal'>
            by
            {#if authorPubkey != null}
              <InlineProfile pubkey={authorPubkey} title={author} />
            {:else}
              {author}
            {/if}
          </h3>
          {#if version != '1'}
            <h3 class='text-base font-thin'>version: {version}</h3>
          {/if}
        </a>
      </div>
      <div class="flex flex-col justify-start items-center">
        <CardActions event={event} />
      </div>
    </div>
  </Card>
{/if}
