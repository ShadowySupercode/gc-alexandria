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
  import {
    lnurlpWellKnownUrl,
    checkCommunity,
  } from "$lib/utils/search_utility";
  import { bech32 } from "bech32";
  import { getNdkContext, activeInboxRelays } from "$lib/ndk";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import {
    isPubkeyInUserLists,
    fetchCurrentUserLists,
  } from "$lib/utils/user_lists";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  type UserLite = { npub?: string | null };
  type Profile = {
    name?: string;
    display_name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
    // Optional flags that might come via cached profile data
    isInUserLists?: boolean;
  } | null;

  const props = $props<{
    user?: UserLite;
    profile: Profile;
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

  function displayName() {
    const p = props.profile;
    const u = props.user;
    return (
      p?.display_name ||
      p?.displayName ||
      p?.name ||
      (u?.npub ? u.npub.slice(0, 10) + "…" : "")
    );
  }

  function shortNpub() {
    const npub = props.user?.npub;
    if (!npub) return "";
    return npub.slice(0, 12) + "…" + npub.slice(-8);
  }

  function hideOnError(e: Event) {
    const img = e.currentTarget as HTMLImageElement | null;
    if (img) {
      img.style.display = "none";
      const next = img.nextElementSibling as HTMLElement | null;
      if (next) next.classList.remove("hidden");
    }
  }

  function getIdentifiers(
    event: NDKEvent,
    profile: any,
  ): { label: string; value: string; link?: string }[] {
    const ids: { label: string; value: string; link?: string }[] = [];
    if (event.kind === 0) {
      const npub = toNpub(event.pubkey);
      if (npub)
        ids.push({ label: "npub", value: npub, link: `/events?id=${npub}` });
      ids.push({
        label: "nprofile",
        value: nprofileEncode(event.pubkey, $activeInboxRelays),
        link: `/events?id=${nprofileEncode(event.pubkey, $activeInboxRelays)}`,
      });
      ids.push({
        label: "nevent",
        value: neventEncode(event, $activeInboxRelays),
        link: `/events?id=${neventEncode(event, $activeInboxRelays)}`,
      });
      ids.push({ label: "pubkey", value: event.pubkey });
    } else {
      ids.push({
        label: "nevent",
        value: neventEncode(event, $activeInboxRelays),
        link: `/events?id=${neventEncode(event, $activeInboxRelays)}`,
      });
      try {
        const naddr = naddrEncode(event, $activeInboxRelays);
        ids.push({ label: "naddr", value: naddr, link: `/events?id=${naddr}` });
      } catch {}
      ids.push({
        label: "id",
        value: event.id,
        link: `/events?id=${event.id}`,
      });
    }
    return ids;
  }

  function navigateToIdentifier(link: string) {
    goto(link);
  }

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
      <Heading tag="h1" class="h-leather mb-2">{displayName()}</Heading>
      {#if props.user?.npub}
        <CopyToClipboard displayText={shortNpub()} copyText={props.user.npub} />
      {/if}

      {#if props.event}
        <div class="flex items-center gap-2 min-w-0">
          {#if props.profile?.nip05}
            <span class="profile-nip05-badge">{props.profile.nip05}</span>
          {/if}
          {#if communityStatus === true}
            <div
              class="community-status-indicator"
              title="Has posted to the community"
            >
              <svg
                class="community-status-icon"
                fill="currentColor"
                viewBox="0 0 24 24"
                ><path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                /></svg
              >
            </div>
          {/if}
          {#if isInUserLists === true}
            <div
              class="user-list-indicator"
              title="In your lists (follows, etc.)"
            >
              <svg
                class="user-list-icon"
                fill="currentColor"
                viewBox="0 0 24 24"
                ><path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                /></svg
              >
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if props.profile?.about}
      <div class="prose dark:prose-invert card-prose">
        {@render basicMarkup(props.profile.about, ndk)}
      </div>
    {/if}

    <div class="flex flex-wrap gap-4 text-sm">
      {#if props.profile?.website}
        <a
          href={props.profile.website}
          rel="noopener"
          class="text-primary-600 dark:text-primary-400 hover:underline break-all"
          target="_blank">{props.profile.website}</a
        >
      {/if}
    </div>

    <div class="flex flex-row flex-wrap justify-end gap-4 text-sm">
      {#if props.profile?.lud16}
        <Button
          color="alternative"
          size="xs"
          onclick={() => (lnModalOpen = true)}>⚡ {props.profile.lud16}</Button
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
            props.user?.npub ?? toNpub(props.event.pubkey),
            props.profile?.displayName ||
              props.profile?.display_name ||
              props.profile?.name ||
              props.event?.pubkey ||
              "",
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
