<script lang="ts">
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
    <div class="w-full bg-primary-200 dark:bg-primary-800 relative">
      <LazyImage
        src={props.profile.banner}
        alt="Profile banner"
        eventId={props.event.id}
        className="w-full h-60 object-cover"
      />
    </div>
  {:else}
    <div
      class="w-full h-60"
      style={`background-color: ${generateDarkPastelColor(props.event.id)};`}
    ></div>
  {/if}

  <div class={`p-6 flex flex-col gap-4 relative`}>
    <Avatar
      size="xl"
      src={props.profile?.picture ?? null}
      alt="Avatar"
      class="absolute w-fit top-[-56px]"
    />

    <div class="flex flex-col gap-3 mt-14">
      <Heading tag="h1" class="h-leather mb-2">{displayName()}</Heading>
      {#if props.user?.npub}
        <CopyToClipboard displayText={shortNpub()} copyText={props.user.npub} />
      {/if}

      {#if props.event}
        <div class="flex items-center gap-2 min-w-0">
          {#if props.profile?.nip05}
            <span
              class="px-2 py-0.5 !mb-0 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs"
              >{props.profile.nip05}</span
            >
          {/if}
          {#if communityStatus === true}
            <div
              class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
              title="Has posted to the community"
            >
              <svg
                class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
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
              class="flex-shrink-0 w-4 h-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center"
              title="In your lists (follows, etc.)"
            >
              <svg
                class="w-3 h-3 text-red-600 dark:text-red-400"
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
      <div
        class="prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere min-w-0"
      >
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
