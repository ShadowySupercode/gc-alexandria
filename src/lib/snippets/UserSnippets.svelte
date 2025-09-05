<script module lang="ts">
  import { goto } from "$app/navigation";
  import {
    createProfileLinkWithVerification,
    toNpub,
    getUserMetadata,
  } from "$lib/utils/nostrUtils";
  import type { UserProfile } from "$lib/models/user_profile";
  import NDK from "@nostr-dev-kit/ndk";

  export { userBadge };
</script>

{#snippet userBadge(identifier: string, displayText: string | undefined, ndk?: NDK)}
  {@const npub = toNpub(identifier)}
  {#if npub}
    {#if !displayText || displayText.trim().toLowerCase() === "unknown"}
      {#await getUserMetadata(npub, ndk, false) then profile}
        {@const p = profile as UserProfile}
        <span class="inline-flex items-center gap-0.5">
          <button
            class="npub-badge bg-transparent border-none p-0 underline cursor-pointer"
            onclick={() => goto(`/events?id=${npub}`)}
          >
            @{(p.displayName && p.displayName.length > 0 ? p.displayName[0] : null) ||
              (p.display_name && p.display_name.length > 0 ? p.display_name[0] : null) ||
              (p.name && p.name.length > 0 ? p.name[0] : null) ||
              npub.slice(0, 8) + "..." + npub.slice(-4)}
          </button>
        </span>
      {:catch error}
        {@const debugError = console.error("Error fetching profile for", npub, ":", error)}
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
      {#await createProfileLinkWithVerification(npub as string, displayText, ndk)}
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
