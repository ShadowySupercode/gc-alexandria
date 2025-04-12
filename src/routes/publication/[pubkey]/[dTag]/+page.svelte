<script lang='ts'>
  import Article from '$lib/components/Publication.svelte';
  import type { PageData } from './$types';
  import { onDestroy } from 'svelte';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';

  let { data }: { data: PageData } = $props();

  const { event }: { event: NDKEvent } = data;
  const publicationType = event?.getMatchingTags('type')[0]?.[1];

  onDestroy(() => data.parser.reset());
</script>

<!-- Load is getting into the article component, then failing within. -->
<Article 
  rootId={event?.tagAddress()} 
  publicationType={publicationType} 
  indexEvent={event} 
/>
