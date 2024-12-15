<script lang="ts">
  import { page } from '$app/stores';
  import Article from '$lib/components/Article.svelte';
  import { ndk } from '$lib/ndk';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { TextPlaceholder } from 'flowbite-svelte';

  const id = $page.url.searchParams.get('id');
  const dTag = $page.url.searchParams.get('d');

  let event: NDKEvent | null | undefined;

  if (id) {
    $ndk.fetchEvent(id)
      .then(ev => {
        event = ev;
      })
      .catch(err => {
        console.error(err);
        // TODO: Redirect to 404 page.
      });
  } else if (dTag) {
    $ndk.fetchEvent({ '#d': [dTag] })
      .then(ev => {
        event = ev;
      })
      .catch(err => {
        console.error(err);
        // TODO: Redirect to 404 page.
      });
  } else {
    // TODO: Redirect to 400 page.
  }
</script>

<main>
  {#await event}
    <TextPlaceholder size='xxl' />
  {:then ev}
    <Article index={ev} />
  {/await}
</main>
