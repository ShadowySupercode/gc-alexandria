<script module lang='ts'>
  import { createProfileLink, createProfileLinkWithVerification } from '$lib/utils/nostrUtils';

  export { userBadge };
</script>

{#snippet userBadge(identifier: string, displayText: string | undefined)}
  {#await createProfileLinkWithVerification(identifier, displayText)}
    {@html createProfileLink(identifier, displayText)}
  {:then html}
    {@html html}
  {:catch}
    {@html createProfileLink(identifier, displayText)}
  {/await}
{/snippet}
