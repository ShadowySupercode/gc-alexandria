<!--
  NodeTooltip Component
  
  Displays detailed information about a node when hovering or clicking on it
  in the event network visualization.
-->
<script lang="ts">
  import type { NetworkNode } from "./types";
  import { onMount } from "svelte";
  import { getMatchingTags, toNpub, getUserMetadata } from "$lib/utils/nostrUtils";
  import { getEventKindName } from "$lib/utils/eventColors";
  import { getDisplayNameSync } from "$lib/utils/npubCache";
  import { getBestDisplayName, getBestProfileValue, shortenNpub } from "$lib/utils/profile_parsing";
  import {indexKind, zettelKinds, wikiKind} from "$lib/consts";
  import { getNdkContext } from "$lib/ndk";
  import { nip19 } from "nostr-tools";

  // Component props
  let {
    node,
    selected = false,
    x,
    y,
    onclose,
    starMode = false,
  } = $props<{
    node: NetworkNode; // The node to display information for
    selected?: boolean; // Whether the node is selected (clicked)
    x: number; // X position for the tooltip
    y: number; // Y position for the tooltip
    onclose: () => void; // Function to call when closing the tooltip
    starMode?: boolean; // Whether we're in star visualization mode
  }>();

  // Get NDK instance
  const ndk = getNdkContext();

  // DOM reference and positioning
  let tooltipElement: HTMLDivElement;
  let tooltipX = $state(x + 10); // Add offset to avoid cursor overlap
  let tooltipY = $state(y - 10);

  // Profile loading state for person anchors
  let profileData = $state<any>(null);
  let isLoadingProfile = $state(false);

  // Clear profile data when node changes
  $effect(() => {
    if (node) {
      // Always clear profile data when switching nodes
      profileData = null;
      isLoadingProfile = false;
    }
  });

  // Maximum content length to display
  const MAX_CONTENT_LENGTH = 200;

  /**
   * Shortens a nevent identifier for display
   */
  function shortenNevent(nevent: string): string {
    if (!nevent) return "";
    return `${nevent.slice(0, 8)}...${nevent.slice(-4)}`;
  }

  // Publication event kinds (text/article based)
  const PUBLICATION_KINDS = [wikiKind, indexKind, ...zettelKinds];

  /**
   * Gets the author name from the event tags
   */
  function getAuthorTag(node: NetworkNode): string {
    // For person anchor nodes, use the pubkey directly
    if (node.isPersonAnchor && node.pubkey) {
      return getDisplayNameSync(node.pubkey);
    }
    
    if (node.event) {
      const authorTags = getMatchingTags(node.event, "author");
      if (authorTags.length > 0) {
        return getDisplayNameSync(authorTags[0][1]);
      }
      // Fallback to event pubkey
      if (node.event.pubkey) {
        return getDisplayNameSync(node.event.pubkey);
      }
    }
    return "Unknown";
  }

  /**
   * Gets the summary from the event tags
   */
  function getSummaryTag(node: NetworkNode): string | null {
    if (node.event) {
      const summaryTags = getMatchingTags(node.event, "summary");
      if (summaryTags.length > 0) {
        return summaryTags[0][1];
      }
    }
    return null;
  }

  /**
   * Gets the d-tag from the event
   */
  function getDTag(node: NetworkNode): string {
    if (node.event) {
      const dTags = getMatchingTags(node.event, "d");
      if (dTags.length > 0) {
        return dTags[0][1];
      }
    }
    return "View Publication";
  }

  /**
   * Checks if this is a publication event
   */
  function isPublicationEvent(kind: number): boolean {
    return PUBLICATION_KINDS.includes(kind);
  }

  /**
   * Gets the appropriate URL for the event
   */
  function getEventUrl(node: NetworkNode): string {
    if (isPublicationEvent(node.kind)) {
      return `/publication/id/${node.id}?from=visualize`;
    }
    // For tag anchor nodes, only create URLs for supported tag types
    if (node.isTagAnchor && node.tagType && node.tagValue) {
      // For event anchor nodes (tag type "e"), create nevent URL
      if (node.tagType === 'e') {
        try {
          const nevent = nip19.neventEncode({ id: node.tagValue });
          return `/events?id=${nevent}`;
        } catch (error) {
          // Fallback to raw event ID if nevent encoding fails
          return `/events?id=${node.tagValue}`;
        }
      }
      // Only create URLs for supported parameters: t, n, d
      if (node.tagType === 't' || node.tagType === 'n' || node.tagType === 'd') {
        return `/events?${node.tagType}=${encodeURIComponent(node.tagValue)}`;
      }
      // For other tag types, don't create a URL
      return '';
    }
    // For person anchor nodes, use the pubkey to create an npub
    if (node.isPersonAnchor && node.pubkey) {
      const npub = toNpub(node.pubkey);
      return `/events?id=${npub}`;
    }
    // For regular events, use the event ID
    if (node.id && !node.id.startsWith('tag-anchor-')) {
      return `/events?id=${node.id}`;
    }
    // For other nodes, don't create a URL
    return '';
  }

  /**
   * Gets display text for the link
   */
  function getLinkText(node: NetworkNode): string {
    if (isPublicationEvent(node.kind)) {
      return node.title || "Untitled Publication";
    }
    // For event anchor nodes (tag type "e"), show shortened nevent ID
    if (node.isTagAnchor && node.tagType === "e" && node.tagValue) {
      try {
        const nevent = nip19.neventEncode({ id: node.tagValue });
        return shortenNevent(nevent);
      } catch (error) {
        // Fallback to truncated tag value if nevent encoding fails
        return truncateContent(node.tagValue, 500);
      }
    }
    // For other tag anchor nodes, truncate the title to prevent explosion
    if (node.isTagAnchor && node.title) {
      return truncateContent(node.title, 500);
    }
    // For arbitrary events, show event kind name
    return node.title || `Event ${node.kind}`;
  }

  /**
   * Truncates content to a maximum length
   */
  function truncateContent(
    content: string,
    maxLength: number = MAX_CONTENT_LENGTH,
  ): string {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }

  /**
   * Loads profile data for person anchor nodes
   */
  async function loadProfileData() {
    if (!node.isPersonAnchor || !node.pubkey || !ndk) return;
    
    isLoadingProfile = true;
    try {
      profileData = await getUserMetadata(node.pubkey, ndk);
    } catch (error) {
      console.warn("Failed to load profile data:", error);
      profileData = null;
    } finally {
      isLoadingProfile = false;
    }
  }

  /**
   * Closes the tooltip
   */
  function closeTooltip() {
    onclose();
  }

  /**
   * Ensures tooltip is fully visible on screen and loads profile data if needed
   */
  onMount(() => {
    // Load profile data for person anchors
    if (node.isPersonAnchor) {
      loadProfileData();
    }

    if (tooltipElement) {
      const rect = tooltipElement.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const padding = 10; // Padding from window edges

      // Adjust position if tooltip goes off screen
      if (rect.right > windowWidth) {
        tooltipX = windowWidth - rect.width - padding;
      }

      if (rect.bottom > windowHeight) {
        tooltipY = windowHeight - rect.height - padding;
      }

      if (rect.left < 0) {
        tooltipX = padding;
      }

      if (rect.top < 0) {
        tooltipY = padding;
      }
    }
  });
</script>

<div
  bind:this={tooltipElement}
  class="tooltip-leather"
  style="left: {tooltipX}px; top: {tooltipY}px;"
>
  <!-- Close button -->
  <button class="tooltip-close-btn" onclick={closeTooltip} aria-label="Close">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clip-rule="evenodd"
      />
    </svg>
  </button>

  <!-- Tooltip content -->
  <div class="tooltip-content">
    <!-- Title with link -->
    <div class="tooltip-title">
      {#if getEventUrl(node)}
        <a href={getEventUrl(node)} class="tooltip-title-link">
          {getLinkText(node)}
        </a>
      {:else}
        <span class="tooltip-title-text">
          {getLinkText(node)}
        </span>
      {/if}
    </div>

    <!-- Node type and kind -->
    <div class="tooltip-metadata">
      {#if isPublicationEvent(node.kind)}
        {node.type} (kind: {node.kind})
      {:else if node.isTagAnchor}
        Tag Anchor ({node.tagType})
      {:else if node.isPersonAnchor}
        Person Anchor
      {:else}
        {getEventKindName(node.kind)}
        {#if node.event?.created_at}
          · {new Date(node.event.created_at * 1000).toLocaleDateString()}
        {/if}
      {/if}
    </div>

    <!-- Pub Author - only show for regular event nodes, not tag anchors -->
    {#if !node.isPersonAnchor && !node.isTagAnchor}
      <div class="tooltip-metadata">
        Pub Author: {getAuthorTag(node)}
      </div>
    {/if}

    <!-- Person anchor profile information -->
    {#if node.isPersonAnchor}
      <div class="tooltip-metadata">
        {node.pubkey ? shortenNpub(toNpub(node.pubkey)) : "Unknown"}
      </div>
      
      {#if isLoadingProfile}
        <div class="tooltip-metadata text-gray-500">
          Loading profile...
        </div>
      {:else if profileData}
        <!-- Display name -->
        {#if getBestDisplayName(profileData)}
          <div class="tooltip-metadata">
            <strong>Name:</strong> {getBestDisplayName(profileData)}
          </div>
        {/if}
        
        <!-- NIP-05 verification -->
        {#if getBestProfileValue(profileData.nip05)}
          <div class="tooltip-metadata">
            <strong>Verified:</strong> {getBestProfileValue(profileData.nip05)}
          </div>
        {/if}
        
        <!-- Bio/About -->
        {#if getBestProfileValue(profileData.about)}
          <div class="tooltip-summary">
            <strong>About:</strong> {truncateContent(getBestProfileValue(profileData.about), 150)}
          </div>
        {/if}
        
        <!-- Connection counts -->
        {#if node.content}
          <div class="tooltip-metadata">
            <strong>Connections:</strong> {node.content}
          </div>
        {/if}
      {/if}
    {:else if node.author && !node.isTagAnchor}
      <div class="tooltip-metadata">
        published_by: {node.author}
      </div>
    {:else if !node.isTagAnchor}
      <!-- Fallback to author tag - only for non-tag anchor nodes -->
      <div class="tooltip-metadata">
        published_by: {getAuthorTag(node)}
      </div>
    {/if}

    {#if isPublicationEvent(node.kind)}
      <!-- Summary (for publication index nodes) -->
      {#if node.isContainer && getSummaryTag(node)}
        <div class="tooltip-summary">
          <span class="font-semibold">Summary:</span>
          {truncateContent(getSummaryTag(node) || "")}
        </div>
      {/if}

      <!-- Content preview for publications -->
      {#if node.content}
        <div class="tooltip-content-preview">
          {truncateContent(node.content)}
        </div>
      {/if}
    {:else}
      <!-- For arbitrary events, show raw content or tags -->
      {#if node.event?.content}
        <div class="tooltip-content-preview">
          <span class="font-semibold">Content:</span>
          <pre class="whitespace-pre-wrap">{truncateContent(
              node.event.content,
            )}</pre>
        </div>
      {/if}

      <!-- Show some relevant tags for non-publication events -->
      {#if node.event?.tags && node.event.tags.length > 0}
        <div class="tooltip-metadata">
          Tags: {node.event.tags.length}
          {#if node.event.tags.length <= 3}
            {#each node.event.tags as tag}
              <span class="text-xs"
                >· {tag[0]}{tag[1]
                  ? `: ${tag[0] === "p" ? getDisplayNameSync(tag[1]) : tag[1].substring(0, 20)}${tag[1].length > 20 && tag[0] !== "p" ? "..." : ""}`
                  : ""}</span
              >
            {/each}
          {/if}
        </div>
      {/if}
    {/if}

    <!-- Help text for selected nodes -->
    {#if selected}
      <div class="tooltip-help-text">
        {#if isPublicationEvent(node.kind)}
          Click to view publication · Click node again to dismiss
        {:else}
          Click to view event details · Click node again to dismiss
        {/if}
      </div>
    {/if}
  </div>
</div>
