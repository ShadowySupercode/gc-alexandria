<script module lang='ts'>
  import { createProfileLink, createProfileLinkWithVerification, toNpub } from '$lib/utils/nostrUtils';

  export { userBadge };
</script>

{#snippet userBadge(identifier: string, displayText: string | undefined)}
  {#if toNpub(identifier)}
    {#await createProfileLinkWithVerification(toNpub(identifier) as string, displayText)}
      {@html createProfileLink(toNpub(identifier) as string, displayText)}
    {:then html}
      {@html html}
    {:catch}
      {@html createProfileLink(toNpub(identifier) as string, displayText)}
    {/await}
  {:else}
    {displayText ?? ''}
  {/if}
{/snippet}
