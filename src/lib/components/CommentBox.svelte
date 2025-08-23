<script lang="ts">
  import { Button, Textarea, Alert, Modal, Input } from "flowbite-svelte";
  import { UserOutline } from "flowbite-svelte-icons";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { nip19 } from "nostr-tools";
  import { toNpub, getUserMetadata } from "$lib/utils/nostrUtils";
  import { searchProfiles } from "$lib/utils/search_utility";
  import type {
    NostrProfile,
    ProfileSearchResult,
  } from "$lib/utils/search_utility";


  import { userStore } from "$lib/stores/userStore";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { NostrKind } from "$lib/types";
  import {
    extractRootEventInfo,
    extractParentEventInfo,
    buildReplyTags,
    createSignedEvent,
    publishEvent,
    navigateToEvent,
  } from "$lib/utils/nostrEventService";
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";

  const props = $props<{
    event: NDKEvent;
    userRelayPreference: boolean;
  }>();

  const ndk = getNdkContext();

  let content = $state("");
  let preview = $state("");
  let isSubmitting = $state(false);
  let success = $state<{ relay: string; eventId: string } | null>(null);
  let error = $state<string | null>(null);
  let showOtherRelays = $state(false);
  let showSecondaryRelays = $state(false);
  let userProfile = $state<NostrProfile | null>(null);

  // Add state for modals and search
  let showMentionModal = $state(false);
  let showWikilinkModal = $state(false);
  let mentionSearch = $state("");
  let mentionResults = $state<NostrProfile[]>([]);
  let mentionLoading = $state(false);
  let wikilinkTarget = $state("");
  let wikilinkLabel = $state("");
  let mentionSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let mentionSearchInput: HTMLInputElement | undefined;

  // Reset modal state when it opens/closes
  $effect(() => {
    if (showMentionModal) {
      // Reset search when modal opens
      mentionSearch = "";
      mentionResults = [];
      mentionLoading = false;
      // Focus the search input after a brief delay to ensure modal is rendered
      setTimeout(() => {
        mentionSearchInput?.focus();
      }, 100);
    } else {
      // Reset search when modal closes
      mentionSearch = "";
      mentionResults = [];
      mentionLoading = false;
    }
  });

  // Get user profile from userStore
  $effect(() => {
    const currentUser = $userStore;
    if (currentUser?.signedIn && currentUser.profile) {
      userProfile = currentUser.profile;
      error = null;
    } else {
      userProfile = null;
      error = null;
    }
  });

  $effect(() => {
    if (!success) return;

    content = "";
    preview = "";
  });

  // Markup buttons
  const markupButtons = [
    { label: "Bold", action: () => insertMarkup("**", "**") },
    { label: "Italic", action: () => insertMarkup("_", "_") },
    { label: "Strike", action: () => insertMarkup("~~", "~~") },
    { label: "Link", action: () => insertMarkup("[", "](url)") },
    { label: "Image", action: () => insertMarkup("![", "](url)") },
    { label: "Quote", action: () => insertMarkup("> ", "") },
    { label: "List", action: () => insertMarkup("* ", "") },
    { label: "Numbered List", action: () => insertMarkup("1. ", "") },
    { label: "Hashtag", action: () => insertMarkup("#", "") },
    {
      label: "@",
      action: () => {
        mentionSearch = "";
        mentionResults = [];
        showMentionModal = true;
      },
    },
    {
      label: "Wikilink",
      action: () => {
        showWikilinkModal = true;
      },
    },
  ];

  function insertMarkup(prefix: string, suffix: string) {
    const textarea = document.querySelector("textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    content =
      content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      content.substring(end);
    updatePreview();

    // Set cursor position after the inserted markup
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd =
        start + prefix.length + selectedText.length + suffix.length;
    }, 0);
  }

  async function updatePreview() {
    preview = await parseBasicmarkup(content);
  }

  function clearForm() {
    content = "";
    preview = "";
    error = null;
    showOtherRelays = false;
    showSecondaryRelays = false;
  }

  function removeFormatting() {
    content = content
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/^>\s*/gm, "")
      .replace(/^[-*]\s*/gm, "")
      .replace(/^\d+\.\s*/gm, "")
      .replace(/#(\w+)/g, "$1");
    updatePreview();
  }

  async function handleSubmit(
    useOtherRelays = false,
    useSecondaryRelays = false,
  ) {
    isSubmitting = true;
    error = null;
    success = null;

    try {
      const pk = $userStore.pubkey || "";
      const npub = toNpub(pk);

      if (!npub) {
        throw new Error(
          "Invalid public key: must be a 64-character hex string.",
        );
      }

      if (props.event.kind === undefined || props.event.kind === null) {
        throw new Error("Invalid event: missing kind");
      }

      const parent = props.event;
      // Use the same kind as parent for replies, or GenericReply for generic replies
      const kind = parent.kind === NostrKind.TextNote ? NostrKind.TextNote : NostrKind.GenericReply;

      // Extract root and parent event information
      const rootInfo = extractRootEventInfo(parent);
      const parentInfo = extractParentEventInfo(parent);

      // Build tags for the reply
      const tags = buildReplyTags(parent, rootInfo, parentInfo, kind);

      // Create and sign the event
      const { event: signedEvent } = await createSignedEvent(
        content,
        pk,
        kind,
        tags,
      );

      // Publish the event using the new relay system
      let relays = $activeOutboxRelays;
      
      if (useOtherRelays && !useSecondaryRelays) {
        relays = [...$activeOutboxRelays, ...$activeInboxRelays];
      } else if (useSecondaryRelays) {
        // For secondary relays, use a subset of outbox relays
        relays = $activeOutboxRelays.slice(0, 3); // Use first 3 outbox relays
      }

      const successfulRelays = await publishEvent(signedEvent, relays, ndk);

      success = {
        relay: successfulRelays[0] || "Unknown relay",
        eventId: signedEvent.id,
      };

      // Clear form after successful submission
      content = "";
      preview = "";
      showOtherRelays = false;
      showSecondaryRelays = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error occurred";
    } finally {
      isSubmitting = false;
    }
  }

  // Add a helper to shorten npub
  function shortenNpub(npub: string | undefined) {
    if (!npub) return "";
    return npub.slice(0, 8) + "…" + npub.slice(-4);
  }

  async function insertAtCursor(text: string) {
    const textarea = document.querySelector("textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    content = content.substring(0, start) + text + content.substring(end);
    updatePreview();

    // Wait for DOM updates to complete
    await tick();

    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
  }

  // Add mention search functionality using centralized search utility
  let communityStatus: Record<string, boolean> = $state({});
  let isSearching = $state(false);

  // Reactive search with debouncing
  $effect(() => {
    // Clear existing timeout
    if (mentionSearchTimeout) {
      clearTimeout(mentionSearchTimeout);
    }

    // If search is empty, clear results immediately
    if (!mentionSearch.trim()) {
      mentionResults = [];
      communityStatus = {};
      mentionLoading = false;
      return;
    }

    // Set loading state immediately for better UX
    mentionLoading = true;

    // Debounce the search with 300ms delay
    mentionSearchTimeout = setTimeout(() => {
      searchMentions();
    }, 300);
  });

  async function searchMentions() {
    if (!mentionSearch.trim()) {
      mentionResults = [];
      communityStatus = {};
      return;
    }

    // Prevent multiple concurrent searches
    if (isSearching) {
      return;
    }

    console.log("Starting search for:", mentionSearch.trim());

    // Set loading state
    mentionLoading = true;
    isSearching = true;

    try {
      console.log("Search promise created, waiting for result...");
      const result = await searchProfiles(mentionSearch.trim(), ndk);
      console.log("Search completed, found profiles:", result.profiles.length);
      console.log("Profile details:", result.profiles);
      console.log("Community status:", result.Status);

      // Update state
      mentionResults = result.profiles;
      communityStatus = result.Status;

      console.log(
        "State updated - mentionResults length:",
        mentionResults.length,
      );
      console.log(
        "State updated - communityStatus keys:",
        Object.keys(communityStatus),
      );
    } catch (error) {
      console.error("Error searching mentions:", error);
      mentionResults = [];
      communityStatus = {};
    } finally {
      mentionLoading = false;
      isSearching = false;
      console.log(
        "Search finished - loading:",
        mentionLoading,
        "searching:",
        isSearching,
      );
    }
  }

  function selectMention(profile: NostrProfile) {
    let mention = "";
    if (profile.pubkey) {
      try {
        const npub = toNpub(profile.pubkey);
        if (npub) {
          mention = `${npub}`;
        } else {
          // If toNpub fails, fallback to pubkey
          mention = `${profile.pubkey}`;
        }
      } catch (e) {
        console.error("Error in toNpub:", e);
        // Fallback to pubkey if conversion fails
        mention = `${profile.pubkey}`;
      }
    } else {
      console.warn("No pubkey in profile, falling back to display name");
      mention = `@${profile.displayName || profile.name}`;
    }
    insertAtCursor(mention);
    showMentionModal = false;
    mentionSearch = "";
    mentionResults = [];
  }

  function insertWikilink() {
    let markup = "";
    if (wikilinkLabel.trim()) {
      markup = `[[${wikilinkTarget}|${wikilinkLabel}]]`;
    } else {
      markup = `[[${wikilinkTarget}]]`;
    }
    insertAtCursor(markup);
    showWikilinkModal = false;
    wikilinkTarget = "";
    wikilinkLabel = "";
  }

  function handleViewComment() {
    if (success?.eventId) {
      const nevent = nip19.neventEncode({ id: success.eventId });
      goto(`/events?id=${encodeURIComponent(nevent)}`);
    }
  }
</script>

<div class="w-full space-y-4">
  <div class="flex flex-wrap gap-2">
    {#each markupButtons as button}
      <Button size="xs" onclick={button.action}>{button.label}</Button>
    {/each}
    <Button size="xs" color="alternative" onclick={removeFormatting}
      >Remove Formatting</Button
    >
    <Button size="xs" color="alternative" onclick={clearForm}>Clear</Button>
  </div>

  <!-- Mention Modal -->
  <Modal
    class="modal-leather"
    title="Mention User"
    bind:open={showMentionModal}
    autoclose
    outsideclose
    size="sm"
  >
    <div class="space-y-4">
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Search display name, name, NIP-05, or npub..."
          bind:value={mentionSearch}
          bind:this={mentionSearchInput}
          onkeydown={(e) => {
            if (e.key === "Enter" && mentionSearch.trim()) {
              // The reactive effect will handle the search automatically
              e.preventDefault();
            }
          }}
          class="flex-1 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500 p-2.5"
        />
        <Button
          size="xs"
          color="primary"
          onclick={(e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            // The reactive effect will handle the search automatically
          }}
          disabled={!mentionSearch.trim()}
        >
          {#if isSearching}
            Searching...
          {:else}
            Search
          {/if}
        </Button>
      </div>

      {#if mentionLoading}
        <div class="text-center py-4">Searching...</div>
      {:else if mentionResults.length > 0}
        <div class="text-center py-2 text-xs text-gray-500">
          Found {mentionResults.length} results
        </div>
        <div
          class="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <ul class="space-y-1 p-2">
            {#each mentionResults as profile}
              <button
                type="button"
                class="w-full text-left cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded flex items-center gap-3"
                onclick={() => selectMention(profile)}
              >
                {#if profile.isInUserLists}
                  <div
                    class="flex-shrink-0 w-6 h-6 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center"
                    title="In your lists"
                  >
                    <svg
                      class="w-4 h-4 text-red-600 dark:text-red-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
                    </svg>
                  </div>
                {:else if profile.pubkey && communityStatus[profile.pubkey]}
                  <div
                    class="flex-shrink-0 w-6 h-6 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
                    title="Has posted to the community"
                  >
                    <svg
                      class="w-4 h-4 text-yellow-600 dark:text-yellow-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      />
                    </svg>
                  </div>
                {:else}
                  <div class="flex-shrink-0 w-6 h-6"></div>
                {/if}
                {#if profile.picture}
                  <img
                    src={profile.picture}
                    alt="Profile"
                    class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                {:else}
                  <div class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0 flex items-center justify-center">
                    <UserOutline class="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </div>
                {/if}
                <div class="flex flex-col text-left min-w-0 flex-1">
                  <span class="font-semibold truncate">
                    {profile.displayName || profile.name || "anon"}
                  </span>
                  {#if profile.nip05}
                    <span class="text-xs text-gray-500 flex items-center gap-1">
                      <svg
                        class="inline w-4 h-4 text-primary-500"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        viewBox="0 0 24 24"
                        ><path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M5 13l4 4L19 7"
                        /></svg
                      >
                      {profile.nip05}
                    </span>
                  {/if}
                  <span class="text-xs text-gray-400 font-mono truncate"
                    >{shortenNpub(profile.pubkey)}</span
                  >
                </div>
              </button>
            {/each}
          </ul>
        </div>
      {:else if mentionSearch.trim()}
        <div class="text-center py-4 text-gray-500">No results found</div>
      {:else}
        <div class="text-center py-4 text-gray-500">
          Enter a search term to find users
        </div>
      {/if}
    </div>
  </Modal>

  <!-- Wikilink Modal -->
  <Modal
    class="modal-leather"
    title="Insert Wikilink"
    bind:open={showWikilinkModal}
    autoclose
    outsideclose
    size="sm"
  >
    <Input
      type="text"
      placeholder="Target page (e.g. target page or target-page)"
      bind:value={wikilinkTarget}
      class="mb-2"
    />
    <Input
      type="text"
      placeholder="Display text (optional)"
      bind:value={wikilinkLabel}
      class="mb-4"
    />
    <div class="flex justify-end gap-2">
      <Button size="xs" color="primary" onclick={insertWikilink}>Insert</Button
      >
      <Button
        size="xs"
        color="alternative"
        onclick={() => {
          showWikilinkModal = false;
        }}>Cancel</Button
      >
    </div>
  </Modal>

  <div class="space-y-4">
    <div>
      <Textarea
        bind:value={content}
        on:input={updatePreview}
        placeholder="Write your comment..."
        rows={10}
        class="w-full"
      />
    </div>
    <div
      class="prose dark:prose-invert max-w-none p-4 border border-gray-300 dark:border-gray-700 rounded-lg"
    >
      {@html preview}
    </div>
  </div>

  {#if error}
    <Alert color="red" dismissable>
      {error}
      {#if showOtherRelays}
        <Button size="xs" class="mt-2" onclick={() => handleSubmit(true)}
          >Try Other Relays</Button
        >
      {/if}
      {#if showSecondaryRelays}
        <Button
          size="xs"
          class="mt-2"
          onclick={() => handleSubmit(false, true)}>Try Fallback Relays</Button
        >
      {/if}
    </Alert>
  {/if}

  {#if success}
    <Alert color="green" dismissable>
      Comment published successfully to {success.relay}!<br />
      Event ID: <span class="font-mono">{success.eventId}</span>
      <button
        onclick={handleViewComment}
        class="text-primary-600 dark:text-primary-500 hover:underline ml-2"
      >
        View your comment
      </button>
    </Alert>
  {/if}

  <div class="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-4">
    {#if userProfile}
      <div class="flex items-center gap-2 text-sm min-w-0 flex-shrink">
        {#if userProfile.picture}
          <img
            src={userProfile.picture}
            alt={userProfile.name || "Profile"}
            class="w-8 h-8 rounded-full object-cover flex-shrink-0"
            onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
          />
        {:else}
          <div class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
            <UserOutline class="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </div>
        {/if}
        <span class="text-gray-900 dark:text-gray-100 truncate">
          {userProfile.displayName ||
            userProfile.name ||
            "anon"}
        </span>
      </div>
    {/if}
    <Button
      onclick={() => handleSubmit()}
      disabled={isSubmitting || !content.trim() || !$userStore.pubkey}
      class="w-auto min-w-[120px]"
    >
      {#if !$userStore.pubkey}
        Not Signed In
      {:else if isSubmitting}
        Publishing...
      {:else}
        Post Comment
      {/if}
    </Button>
  </div>

  {#if !$userStore.pubkey}
    <Alert color="yellow" class="mt-4">
      Please sign in to post comments. Your comments will be signed with your
      current account.
    </Alert>
  {/if}
</div>

<style>
  /* Add styles for disabled state */
  :global(.disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
