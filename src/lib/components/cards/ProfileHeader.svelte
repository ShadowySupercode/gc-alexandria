<script lang="ts">
  import { Card, Modal, Button, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils.ts";
  import type { NostrProfile } from "$lib/utils/search_types";
  import { parseProfileContent, getBestProfileValue } from "$lib/utils/profile_parsing";
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
  import { isPubkeyInUserLists, fetchCurrentUserLists } from "$lib/utils/user_lists";
  import { UserOutline } from "flowbite-svelte-icons";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";
  import { getNdkContext } from "$lib/ndk";

  const {
    event,
    profile,
    identifiers = [],
    communityStatusMap = {},
  } = $props<{
    event: NDKEvent;
    profile: NostrProfile;
    identifiers?: { label: string; value: string; link?: string }[];
    communityStatusMap?: Record<string, boolean>;
  }>();

  const ndk = getNdkContext();

  // AI-NOTE: Re-parse profile data from event to ensure we get all tag values
  // instead of relying on potentially cached profile data
  let freshProfile = $derived(() => {
    if (event.kind === 0) {
      return parseProfileContent(event);
    }
    return profile;
  });

  let lnModalOpen = $state(false);
  let lnurl = $state<string | null>(null);
  let currentLud16 = $state<string | null>(null);
  let communityStatus = $state<boolean | null>(null);
  let isInUserLists = $state<boolean | null>(null);

  onMount(async () => {
    // Initialize currentLud16 with the first lud16 value
    if (freshProfile()?.lud16) {
      currentLud16 = getBestProfileValue(freshProfile().lud16);
    }
  });

  // Update lnurl when currentLud16 changes
  $effect(() => {
    if (currentLud16) {
      try {
        // Convert LN address to LNURL
        const [name, domain] = currentLud16.split("@");
        const url = lnurlpWellKnownUrl(domain, name);
        const words = bech32.toWords(new TextEncoder().encode(url));
        lnurl = bech32.encode("lnurl", words);
      } catch {
        console.log("Error converting LN address to LNURL");
        lnurl = null;
      }
    }
  });

  $effect(() => {
    if (event?.pubkey) {
      // First check if we have user list information in the profile prop
      if (freshProfile() && typeof freshProfile().isInUserLists === 'boolean') {
        isInUserLists = freshProfile().isInUserLists;
        console.log(`[ProfileHeader] Using profile prop user list status for ${event.pubkey}: ${isInUserLists}`);
      } else {
        // Then check if we have cached profileData with user list information
        const cachedProfileData = (event as any).profileData;
        console.log(`[ProfileHeader] Checking user list status for ${event.pubkey}, cached profileData:`, cachedProfileData);
        
        if (cachedProfileData && typeof cachedProfileData.isInUserLists === 'boolean') {
          isInUserLists = cachedProfileData.isInUserLists;
          console.log(`[ProfileHeader] Using cached user list status for ${event.pubkey}: ${isInUserLists}`);
        } else {
          console.log(`[ProfileHeader] No cached user list data, fetching for ${event.pubkey}`);
          // Fallback to fetching user lists
          fetchCurrentUserLists()
            .then((userLists) => {
              console.log(`[ProfileHeader] Fetched ${userLists.length} user lists for ${event.pubkey}`);
              isInUserLists = isPubkeyInUserLists(event.pubkey, userLists);
              console.log(`[ProfileHeader] Final user list status for ${event.pubkey}: ${isInUserLists}`);
            })
            .catch((error) => {
              console.error(`[ProfileHeader] Error fetching user lists for ${event.pubkey}:`, error);
              isInUserLists = false;
            });
        }
      }

      // Check community status - use cached data if available
      if (communityStatusMap[event.pubkey] !== undefined) {
        communityStatus = communityStatusMap[event.pubkey];
        console.log(`[ProfileHeader] Using cached community status for ${event.pubkey}: ${communityStatus}`);
      } else {
        // Fallback to checking community status
        checkCommunity(event.pubkey)
          .then((status) => {
            communityStatus = status;
          })
          .catch(() => {
            communityStatus = false;
          });
      }
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
        {#if freshProfile().banner && freshProfile().banner.length > 0}
          <LazyImage
            src={getBestProfileValue(freshProfile().banner)}
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
        {#if freshProfile().picture && freshProfile().picture.length > 0}
          <img
            src={getBestProfileValue(freshProfile().picture)}
            alt="Profile avatar"
            class="w-16 h-16 rounded-full object-cover border flex-shrink-0"
            onerror={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div class="w-16 h-16 rounded-full border flex-shrink-0 bg-gray-300 dark:bg-gray-600 flex items-center justify-center hidden">
            <UserOutline class="w-8 h-8 text-gray-600 dark:text-gray-300" />
          </div>
        {:else}
          <div class="w-16 h-16 rounded-full border flex-shrink-0 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
            <UserOutline class="w-8 h-8 text-gray-600 dark:text-gray-300" />
          </div>
        {/if}
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="min-w-0 flex-1">
            {@render userBadge(
              toNpub(event.pubkey) as string,
              undefined,
              ndk,
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
          {#if isInUserLists === true}
            <div
              class="flex-shrink-0 w-4 h-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center"
              title="In your lists (follows, etc.)"
            >
              <svg
                class="w-3 h-3 text-red-600 dark:text-red-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            </div>
          {:else if isInUserLists === false}
            <div class="flex-shrink-0 w-4 h-4"></div>
          {/if}
        </div>
      </div>
      <div class="min-w-0">
        <div class="mt-2 flex flex-col gap-4">
          <dl class="grid grid-cols-1 gap-y-2">
            {#if freshProfile().name}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Name:</dt>
                <dd class="min-w-0 break-words flex flex-col gap-1">
                  {#each freshProfile().name as name}
                    <span>{name}</span>
                  {/each}
                </dd>
              </div>
            {/if}
            {#if freshProfile().display_name}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Display Name:</dt>
                <dd class="min-w-0 break-words flex flex-col gap-1">
                  {#each freshProfile().display_name as displayName}
                    <span>{displayName}</span>
                  {/each}
                </dd>
              </div>
            {/if}
            {#if freshProfile().about}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">About:</dt>
                <dd class="min-w-0 break-words flex flex-col gap-1">
                  {#each freshProfile().about as about}
                    <div class="prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere min-w-0">
                      {@render basicMarkup(Array.isArray(about) ? about[0] || "" : about, ndk)}
                    </div>
                  {/each}
                </dd>
              </div>
            {/if}
            {#if freshProfile().website}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Website:</dt>
                <dd class="min-w-0 break-all flex flex-col gap-1">
                  {#each freshProfile().website as website}
                    <a
                      href={website}
                      class="underline text-primary-700 dark:text-primary-200"
                      >{website}</a
                    >
                  {/each}
                </dd>
              </div>
            {/if}
            {#if freshProfile().lud16}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">Lightning:</dt>
                <dd class="min-w-0 break-all flex flex-col gap-1">
                  {#each freshProfile().lud16 as lud16}
                    <Button
                      class="btn-leather"
                      color="primary"
                      outline
                      onclick={() => {
                        // Set the current lud16 for the modal
                        currentLud16 = lud16;
                        lnModalOpen = true;
                      }}>{lud16}</Button
                    >
                  {/each}
                </dd>
              </div>
            {/if}
            {#if freshProfile().nip05}
              <div class="flex gap-2 min-w-0">
                <dt class="font-semibold min-w-[120px] flex-shrink-0">NIP-05:</dt>
                <dd class="min-w-0 break-all flex flex-col gap-1">
                  {#each freshProfile().nip05 as nip05}
                    <span>{nip05}</span>
                  {/each}
                </dd>
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
    {#if currentLud16}
      <div>
        <div class="flex flex-col items-center">
          {@render userBadge(
            toNpub(event.pubkey) as string,
            undefined,
            ndk,
          )}
          <P class="break-all">{currentLud16}</P>
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
