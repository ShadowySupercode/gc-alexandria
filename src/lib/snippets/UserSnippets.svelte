<script module lang="ts">
  import { goto } from "$app/navigation";
  import {
    createProfileLinkWithVerification,
    toNpub,
    getUserMetadata,
  } from "$lib/utils/nostrUtils";

  // Extend NostrProfile locally to allow display_name for legacy support
  type NostrProfileWithLegacy = {
    displayName?: string;
    display_name?: string;
    name?: string;
    [key: string]: any;
  };

  export { userBadge };
</script>

{#snippet userBadge(identifier: string, displayText: string | undefined)}
  {@const npub = toNpub(identifier)}
  {#if npub}
    {#if !displayText || displayText.trim().toLowerCase() === "unknown"}
      {#await getUserMetadata(npub) then profile}
        {@const p = profile as NostrProfileWithLegacy}
        <span class="inline-flex items-center gap-0.5">
          <button
            class="npub-badge bg-transparent border-none p-0 underline cursor-pointer"
            onclick={() => goto(`/events?id=${npub}`)}
          >
            @{p.displayName ||
              p.display_name ||
              p.name ||
              npub.slice(0, 8) + "..." + npub.slice(-4)}
          </button>
        </span>
      {:catch}
        <span class="inline-flex items-center gap-0.5">
          <button
            class="npub-badge bg-transparent border-none p-0 underline cursor-pointer"
            onclick={() => goto(`/events?id=${npub}`)}
          >
            @{npub.slice(0, 8) + "..." + npub.slice(-4)}
          </button>
        </span>
      {/await}
    {:else}
      {#await createProfileLinkWithVerification(npub as string, displayText)}
        <span class="inline-flex items-center gap-0.5">
          <button
            class="npub-badge bg-transparent border-none p-0 underline cursor-pointer"
            onclick={() => goto(`/events?id=${npub}`)}
          >
            @{displayText}
          </button>
        </span>
      {:then html}
        <span class="inline-flex items-center gap-0.5">
          <button
            class="npub-badge bg-transparent border-none p-0 underline cursor-pointer"
            onclick={() => goto(`/events?id=${npub}`)}
          >
            @{displayText}
          </button>
          {@html html.replace(/([\s\S]*<\/a>)/, "").trim()}
        </span>
      {:catch}
        <span class="inline-flex items-center gap-0.5">
          <button
            class="npub-badge bg-transparent border-none p-0 underline cursor-pointer"
            onclick={() => goto(`/events?id=${npub}`)}
          >
            @{displayText}
          </button>
        </span>
      {/await}
    {/if}
  {:else}
    {displayText ?? ""}
  {/if}
{/snippet}
