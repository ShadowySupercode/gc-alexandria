<script lang="ts">
  import { Card, Modal, Button, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { type NostrProfile, toNpub } from "$lib/utils/nostrUtils.ts";
  import QrCode from "$components/util/QrCode.svelte";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import LazyImage from "$components/util/LazyImage.svelte";
  import { generateDarkPastelColor } from "$lib/utils/image_utils";
  import {
    lnurlpWellKnownUrl,
    checkCommunity,
  } from "$lib/utils/search_utility";
  import { bech32 } from "bech32";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { goto } from "$app/navigation";

  const {
    event,
    profile,
    identifiers = [],
  } = $props<{
    event: NDKEvent;
    profile: NostrProfile;
    identifiers?: { label: string; value: string; link?: string }[];
  }>();

  let lnModalOpen = $state(false);
  let lnurl = $state<string | null>(null);
  let communityStatus = $state<boolean | null>(null);

  onMount(async () => {
    if (profile?.lud16) {
      try {
        // Convert LN address to LNURL
        const [name, domain] = profile?.lud16.split("@");
        const url = lnurlpWellKnownUrl(domain, name);
        const words = bech32.toWords(new TextEncoder().encode(url));
        lnurl = bech32.encode("lnurl", words);
      } catch {
        console.log("Error converting LN address to LNURL");
      }
    }
  });

  $effect(() => {
    if (event?.pubkey) {
      checkCommunity(event.pubkey)
        .then((status) => {
          communityStatus = status;
        })
        .catch(() => {
          communityStatus = false;
        });
    }
  });

  function navigateToIdentifier(link: string) {
    goto(link);
  }
</script>

{#if profile}
  <Card class="ArticleBox card-leather w-full max-w-2xl overflow-hidden">
    <div class="space-y-4">
      <div class="ArticleBoxImage flex col justify-center">
        {#if profile.banner}
          <LazyImage
            src={profile.banner}
            alt="Profile banner"
            eventId={event.id}
            className="rounded w-full max-h-72 object-cover"
          />
        {:else}
          <div 
            class="rounded w-full max-h-72"
            style="background-color: {generateDarkPastelColor(event.id)};"
          >
          </div>
        {/if}
      </div>
      <div class="flex flex-row space-x-4 items-center min-w-0">
        {#if profile.picture}
          <img
            src={profile.picture}
            alt="Profile avatar"
            class="w-16 h-16 rounded-full border flex-shrink-0"
            onerror={(e) => {
              (e.target as HTMLImageElement).src = "/favicon.png";
            }}
          />
        {/if}
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="min-w-0 flex-1">
            {@render userBadge(
              toNpub(event.pubkey) as string,
              profile.displayName ||
                profile.display_name ||
                profile.name ||
                event.pubkey,
            )}
          </div>
          {#if communityStatus === true}
            <div
              class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
              title="Has posted to the community"
            >
              <svg
                class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                />
              </svg>
            </div>
          {:else if communityStatus === false}
            <div class="flex-shrink-0 w-4 h-4"></div>
          {/if}
        </div>
      </div>
      <div class="min-w-0">
        <div class="mt-2 flex flex-col gap-4">
          <dl class="grid grid-cols-1 gap-y-2">
            {#if profile.name}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Name:</dt>
                <dd class="min-w-0 break-words">{profile.name}</dd>
              </div>
            {/if}
            {#if profile.displayName}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Display Name:</dt>
                <dd class="min-w-0 break-words">{profile.displayName}</dd>
              </div>
            {/if}
            {#if profile.about}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">About:</dt>
                <dd class="min-w-0 break-words whitespace-pre-line">{profile.about}</dd>
              </div>
            {/if}
            {#if profile.website}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Website:</dt>
                <dd class="min-w-0 break-all">
                  <a
                    href={profile.website}
                    class="underline text-primary-700 dark:text-primary-200"
                    >{profile.website}</a
                  >
                </dd>
              </div>
            {/if}
            {#if profile.lud16}
              <div class="flex items-center gap-2 mt-4 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Lightning:</dt>
                <dd class="min-w-0 break-all">
                  <Button
                    class="btn-leather"
                    color="primary"
                    outline
                    onclick={() => (lnModalOpen = true)}>{profile.lud16}</Button
                  >
                </dd>
              </div>
            {/if}
            {#if profile.nip05}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">NIP-05:</dt>
                <dd class="min-w-0 break-all">{profile.nip05}</dd>
              </div>
            {/if}
            {#each identifiers as id}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">{id.label}:</dt>
                <dd class="min-w-0 break-all">
                  {#if id.link}
                    <button
                      class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline hover:no-underline transition-colors"
                      onclick={() => navigateToIdentifier(id.link)}
                    >
                      {id.value}
                    </button>
                  {:else}
                    {id.value}
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
        </div>
      </div>
    </div>
  </Card>

  <Modal
    class="modal-leather"
    title="Lightning Address"
    bind:open={lnModalOpen}
    outsideclose
    size="sm"
  >
    {#if profile.lud16}
      <div>
        <div class="flex flex-col items-center">
          {@render userBadge(
            toNpub(event.pubkey) as string,
            profile?.displayName || profile.name || event.pubkey,
          )}
          <P class="break-all">{profile.lud16}</P>
        </div>
        <div class="flex flex-col items-center mt-3 space-y-4">
          <P>Scan the QR code or copy the address</P>
          {#if lnurl}
            <P class="break-all overflow-wrap-anywhere">
              <CopyToClipboard icon={false} displayText={lnurl}
              ></CopyToClipboard>
            </P>
            <QrCode value={lnurl} />
          {:else}
            <P>Couldn't generate address.</P>
          {/if}
        </div>
      </div>
    {/if}
  </Modal>
{/if}
