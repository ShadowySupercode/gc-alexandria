<script lang="ts">
  import { page } from '$app/stores';
  import Article from '$lib/components/Article.svelte';
  import { ndk } from '$lib/ndk';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';

  const id = $page.url.searchParams.get('id');
  let event: NDKEvent | null | undefined;

  if (!id) {
    // TODO: Redirect to 400 page.
  }

  $ndk.fetchEvent(id!)
    .then(ev => {
      event = ev;
    })
    .catch(err => {
      console.error(err);
      // TODO: Redirect to 404 page.
    });
</script>

<main>
	<Article index={event} />
</main>
