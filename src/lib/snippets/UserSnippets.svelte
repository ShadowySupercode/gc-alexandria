<script module lang="ts">
  import {
    createProfileLink,
    createProfileLinkWithVerification,
    toNpub
  } from "$lib/utils";

  export { userBadge };
</script>

{#snippet userBadge(identifier: string, displayText: string | undefined)}
  {#if identifier && (identifier.startsWith('npub') || identifier.startsWith('nprofile'))}
    {#await createProfileLinkWithVerification(identifier, displayText)}
      {@html createProfileLink(identifier, displayText)}
    {:then html}
      {@html html}
    {:catch}
      {@html createProfileLink(identifier, displayText)}
    {/await}
  {:else if identifier}
    {#await createProfileLinkWithVerification(toNpub(identifier) as string, displayText)}
      {@html createProfileLink(toNpub(identifier) as string, displayText)}
    {:then html}
      {@html html}
    {:catch}
      {@html createProfileLink(toNpub(identifier) as string, displayText)}
    {/await}
  {:else}
    {displayText ?? ""}
  {/if}
{/snippet}
