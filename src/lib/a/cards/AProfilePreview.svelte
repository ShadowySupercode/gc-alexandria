<script lang="ts">
/**
 * @fileoverview AProfilePreview Component - Alexandria
 *
 * A comprehensive profile card component for displaying nostr user profiles.
 * Shows avatar, banner, name, bio, NIP-05 verification, lightning address, and user status indicators.
 *
 * @component
 * @category Cards
 *
 * @prop {NDKEvent} event - The nostr event (kind 0 profile) to display (required)
 * @prop {UserLite} [user] - User object containing npub identifier
 * @prop {Profile} profile - User profile metadata (required)
 * @prop {boolean} [loading=false] - Whether the profile is currently loading
 * @prop {string} [error=null] - Error message if profile loading failed
 * @prop {boolean} [isOwn=false] - Whether this is the current user's own profile
 * @prop {Record<string, boolean>} [communityStatusMap=false] - Map of pubkey to community membership status
 *
 * @example
 * ```svelte
 * <AProfilePreview
 *   {event}
 *   user={{npub}}
 *   {profile}
 * />
 * ```
 *
 * @example Own profile with actions
 * ```svelte
 * <AProfilePreview
 *   {event}
 *   {profile}
 *   isOwn={true}
 * />
 * ```
 *
 * @example Loading state
 * ```svelte
 * <AProfilePreview
 *   {event}
 *   {profile}
 *   loading={true}
 * />
 * ```
 *
 * @example With error handling
 * ```svelte
 * <AProfilePreview
 *   {event}
 *   {profile}
 *   error={errorMessage}
 * />
 * ```
 *
 * @features
 * - Banner image with fallback color generation
 * - Avatar display with proper sizing
 * - NIP-05 verification badge display
 * - Community membership indicator (star icon)
 * - User list membership indicator (heart icon)
 * - Lightning address (lud16) with QR code modal
 * - Multiple identifier formats (npub, nprofile, nevent)
 * - Copy to clipboard functionality for identifiers
 * - Website link display
 * - Bio/about text with markup rendering
 * - Own profile actions (notifications, my notes)
 * - Loading and error states
 *
 * @accessibility
 * - Semantic profile structure with proper headings
 * - Keyboard accessible action buttons and dropdowns
 * - Screen reader friendly verification status badges
 * - Proper modal focus management for QR code
 * - Alt text for images
 * - ARIA labels for status indicators
 */

  import {
    Card,
    Heading,
    P,
    Button,
    Modal,
    Avatar,
    Dropdown,
    DropdownItem,
  } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import AAlert from "$lib/a/primitives/AAlert.svelte";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { goto } from "$app/navigation";
  import LazyImage from "$lib/components/util/LazyImage.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";
  import QrCode from "$lib/components/util/QrCode.svelte";
  import { generateDarkPastelColor } from "$lib/utils/image_utils";
  import { getBestDisplayName, getBestProfileValue } from "$lib/utils/profile_parsing";
  import {
    lnurlpWellKnownUrl,
    checkCommunity,
  } from "$lib/utils/search_utility";
  import { bech32 } from "bech32";
  import { type NostrProfile, toNpub } from "$lib/utils/nostrUtils";
  import { getNdkContext } from "$lib/ndk";
  import { getIdentifiers } from "$lib/utils/nostr_identifiers.ts";
  import { shortenNpub } from "$lib/utils/profile_parsing.js";
  import {
    isPubkeyInUserLists,
    fetchCurrentUserLists,
  } from "$lib/utils/user_lists";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { ACommunityIndicator, ANearnessIndicator } from "$lib/a";

  type UserLite = { npub?: string | null };

  const props = $props<{
    user?: UserLite;
    profile: NostrProfile;
    loading?: boolean;
    error?: string | null;
    isOwn?: boolean;
    event: NDKEvent;
    communityStatusMap?: Record<string, boolean>;
  }>();

  const ndk = getNdkContext();

  let lnModalOpen = $state(false);
  let lnurl = $state<string | null>(null);
  let communityStatus = $state<boolean | null>(null);
  let isInUserLists = $state<boolean | null>(null);

  // Compute LNURL on mount if lud16 exists
  $effect(() => {
    const p = props.profile;
    if (p?.lud16) {
      try {
        const [name, domain] = p.lud16.split("@");
        const url = lnurlpWellKnownUrl(domain, name);
        const words = bech32.toWords(new TextEncoder().encode(url));
        lnurl = bech32.encode("lnurl", words);
      } catch {
        lnurl = null;
      }
    } else {
      lnurl = null;
    }
  });

  // Compute community/list status when event changes
  $effect(() => {
    const ev = props.event;
    if (!ev?.pubkey) {
      communityStatus = null;
      isInUserLists = null;
      return;
    }

    // isInUserLists: prefer prop.profile hint, else cached profileData, else fetch
    if (props.profile && typeof props.profile.isInUserLists === "boolean") {
      isInUserLists = props.profile.isInUserLists;
    } else {
      const cachedProfileData = (ev as any).profileData;
      if (
        cachedProfileData &&
        typeof cachedProfileData.isInUserLists === "boolean"
      ) {
        isInUserLists = cachedProfileData.isInUserLists;
      } else {
        fetchCurrentUserLists()
          .then((lists) => {
            isInUserLists = isPubkeyInUserLists(ev.pubkey, lists);
          })
          .catch(() => {
            isInUserLists = false;
          });
      }
    }

    // community status: prefer map if provided, else check
    if (
      props.communityStatusMap &&
      props.communityStatusMap[ev.pubkey] !== undefined
    ) {
      communityStatus = props.communityStatusMap[ev.pubkey];
    } else {
      checkCommunity(ev.pubkey)
        .then((status) => {
          communityStatus = status;
        })
        .catch(() => {
          communityStatus = false;
        });
    }
  });
</script>

<Card
  size="xl"
  class="main-leather p-0 overflow-hidden rounded-lg border border-primary-200 dark:border-primary-700"
>
  {#if props.profile?.banner}
    <div class="card-image-container">
      <LazyImage
        src={props.profile.banner}
        alt="Profile banner"
        eventId={props.event.id}
        className="card-banner"
      />
    </div>
  {:else}
    <div
      class="w-full h-60"
      style={`background-color: ${generateDarkPastelColor(props.event.id)};`}
    ></div>
  {/if}

  <div class={`p-6 flex flex-col relative`}>
    <Avatar
      size="xl"
      src={props.profile?.picture ?? null}
      alt="Avatar"
      class="card-avatar-container"
    />

    <div class="flex flex-col gap-3">
      <Heading tag="h1" class="h-leather mb-2">{getBestDisplayName(props.profile)}</Heading>
      {#if props.user?.npub}
        <CopyToClipboard displayText={shortenNpub(props.user.npub)} copyText={props.user.npub} />
      {/if}

      {#if props.event}
        <div class="flex items-center gap-2 min-w-0">
          {#if props.profile?.nip05}
            <span class="profile-nip05-badge">{getBestProfileValue(props.profile.nip05, '')}</span>
          {/if}
          {#if communityStatus === true}
            <ACommunityIndicator />
          {/if}
          {#if isInUserLists === true}
            <ANearnessIndicator />
          {/if}
        </div>
      {/if}
    </div>

    {#if props.profile?.about}
      <div class="prose dark:prose-invert card-prose">
        {@render basicMarkup(getBestProfileValue(props.profile.about), ndk)}
      </div>
    {/if}

    <div class="flex flex-wrap gap-4 text-sm">
      {#if props.profile?.website}
        {@const website = getBestProfileValue(props.profile.website)}
        <a
          href={website}
          rel="noopener"
          class="text-primary-600 dark:text-primary-400 hover:underline break-all"
          target="_blank">{website}</a
        >
      {/if}
    </div>

    <div class="flex flex-row flex-wrap justify-end gap-4 text-sm mt-1">
      {#if props.profile?.lud16}
        <Button
          color="alternative"
          size="xs"
          onclick={() => (lnModalOpen = true)}>⚡ {getBestProfileValue(props.profile.lud16)}</Button
        >
      {/if}
      <Button size="xs" color="alternative"
        >Identifiers <ChevronDownOutline class="ms-2 h-6 w-6" /></Button
      >
      <Dropdown simple>
        {#each getIdentifiers(props.event, props.profile) as identifier}
          <DropdownItem
            ><CopyToClipboard
              displayText={identifier.label}
              copyText={identifier.value}
            /></DropdownItem
          >
        {/each}
      </Dropdown>

      {#if props.isOwn}
        <Button
          class="!mb-0"
          size="xs"
          onclick={() => goto("/profile/notifications")}>Notifications</Button
        >
        <Button
          class="!mb-0"
          size="xs"
          onclick={() => goto("/profile/my-notes")}>My notes</Button
        >
      {/if}
    </div>

    {#if props.loading}
      <AAlert color="primary">Loading profile…</AAlert>
    {/if}
    {#if props.error}
      <AAlert color="red">Error loading profile: {props.error}</AAlert>
    {/if}
  </div>
</Card>

{#if lnModalOpen}
  <Modal
    class="modal-leather"
    title="Lightning Address"
    bind:open={lnModalOpen}
    outsideclose
    size="sm"
  >
    {#if props.profile?.lud16}
      <div>
        <div class="flex flex-col items-center">
          {@render userBadge(
            props.user?.npub ?? toNpub(props.profile.pubkey),
            getBestDisplayName(props.profile),
            ndk,
          )}
          <P class="break-all">{props.profile.lud16}</P>
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
