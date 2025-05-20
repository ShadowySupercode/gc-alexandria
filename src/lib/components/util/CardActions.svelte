<script lang="ts">
  import {
    ClipboardCheckOutline,
    ClipboardCleanOutline,
    DotsVerticalOutline,
    EyeOutline,
    ShareNodesOutline
  } from "flowbite-svelte-icons";
  import { Button, Modal, Popover } from "flowbite-svelte";
  import { standardRelays } from "$lib/consts";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import InlineProfile from "$components/util/InlineProfile.svelte";

  let { event } = $props();

  // Derive metadata from event
  let title = $derived(event.tags.find((t: string[]) => t[0] === 'title')?.[1] ?? '');
  let summary = $derived(event.tags.find((t: string[]) => t[0] === 'summary')?.[1] ?? '');
  let image = $derived(event.tags.find((t: string[]) => t[0] === 'image')?.[1] ?? null);
  let author = $derived(event.tags.find((t: string[]) => t[0] === 'author')?.[1] ?? '');
  let originalAuthor = $derived(event.tags.find((t: string[]) => t[0] === 'original_author')?.[1] ?? null);
  let version = $derived(event.tags.find((t: string[]) => t[0] === 'version')?.[1] ?? '');
  let source = $derived(event.tags.find((t: string[]) => t[0] === 'source')?.[1] ?? null);
  let type = $derived(event.tags.find((t: string[]) => t[0] === 'type')?.[1] ?? null);
  let language = $derived(event.tags.find((t: string[]) => t[0] === 'language')?.[1] ?? null);
  let publisher = $derived(event.tags.find((t: string[]) => t[0] === 'publisher')?.[1] ?? null);
  let identifier = $derived(event.tags.find((t: string[]) => t[0] === 'identifier')?.[1] ?? null);

  let jsonModalOpen: boolean = $state(false);
  let detailsModalOpen: boolean = $state(false);
  let eventIdCopied: boolean = $state(false);
  let shareLinkCopied: boolean = $state(false);

  let isOpen = $state(false);

  function openPopover() {
    isOpen = true;
  }

  function closePopover() {
    isOpen = false;
    const menu = document.getElementById('dots-' + event.id);
    if (menu) menu.blur();
  }

  function shareNjump() {
    const relays: string[] = standardRelays;
    
    try {
      const naddr = naddrEncode(event, relays);
      console.debug(naddr);
      navigator.clipboard.writeText(`https://njump.me/${naddr}`);
      shareLinkCopied = true;
      setTimeout(() => {
        shareLinkCopied = false;
      }, 4000);
    }
    catch (e) {
      console.error('Failed to encode naddr:', e);
    }
  }

  function copyEventId() {
    console.debug("copyEventID");
    const relays: string[] = standardRelays;
    const nevent = neventEncode(event, relays);

    navigator.clipboard.writeText(nevent);

    eventIdCopied = true;
    setTimeout(() => {
      eventIdCopied = false;
    }, 4000);
  }

  function viewJson() {
    console.debug("viewJSON");
    jsonModalOpen = true;
  }

  function viewDetails() {
    detailsModalOpen = true;
  }

  // --- Custom JSON pretty-printer with naddr hyperlinking ---
  /**
   * Returns HTML for pretty-printed JSON, with naddrs as links to /events?id=naddr1...
   */
  function jsonWithNaddrLinks(obj: any): string {
    const NADDR_REGEX = /\b(\d{5}:[a-f0-9]{64}:[a-zA-Z0-9._-]+)\b/g;
    function replacer(_key: string, value: any) {
      return value;
    }
    // Stringify with 2-space indent
    let json = JSON.stringify(obj, replacer, 2);
    // Replace naddr addresses with links
    json = json.replace(NADDR_REGEX, (match) => {
      try {
        const [kind, pubkey, dtag] = match.split(":");
        // Compose a fake event for naddrEncode
        const fakeEvent = {
          kind: parseInt(kind),
          pubkey,
          tags: [["d", dtag]],
        };
        const naddr = naddrEncode(fakeEvent as any, standardRelays);
        return `<a href='./events?id=${naddr}' class='text-primary-600 underline' target='_blank'>${match}</a>`;
      } catch {
        return match;
      }
    });
    // Escape < and > for HTML safety, but allow our <a> tags
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    json = json.replace(/&lt;a /g, '<a ').replace(/&lt;\/a&gt;/g, '</a>');
    return json;
  }
</script>

<div class="group bg-highlight dark:bg-primary-1000 rounded" role="group" onmouseenter={openPopover}>
  <!-- Main button -->
  <Button type="button"
          id="dots-{event.id}"
          class=" hover:bg-primary-0 dark:text-highlight dark:hover:bg-primary-800 p-1 dots" color="none"
          data-popover-target="popover-actions">
    <DotsVerticalOutline class="h-6 w-6"/>
    <span class="sr-only">Open actions menu</span>
  </Button>

  {#if isOpen}
  <Popover id="popover-actions"
           placement="bottom"
           trigger="click"
           class='popover-leather w-fit z-10'
           onmouseleave={closePopover}
           >
    <div class='flex flex-row justify-between space-x-4'>
      <div class='flex flex-col text-nowrap'>
        <ul class="space-y-2">
          <li>
            <button class='btn-leather w-full text-left' onclick={viewDetails}>
              <EyeOutline class="inline mr-2"  /> View details
            </button>
          </li>
          <li>
            <button class='btn-leather w-full text-left' onclick={shareNjump}>
              {#if shareLinkCopied}
                <ClipboardCheckOutline class="inline mr-2" /> Copied!
              {:else}
                <ShareNodesOutline class="inline mr-2" /> Share via NJump
              {/if}
            </button>
          </li>
          <li>
            <button class='btn-leather w-full text-left' onclick={copyEventId}>
              {#if eventIdCopied}
                <ClipboardCheckOutline class="inline mr-2" /> Copied!
              {:else}
                <ClipboardCleanOutline class="inline mr-2" /> Copy event ID
              {/if}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Popover>
  {/if}
  <!-- Event details -->
  <Modal class='modal-leather' title='Publication details' bind:open={detailsModalOpen} autoclose outsideclose size='sm'>
    <div class="flex flex-row space-x-4">
      {#if image}
        <div class="flex col">
          <img src={image} alt="Publication cover" class="w-32 h-32 object-cover rounded" />
        </div>
      {/if}
      <div class="flex flex-col col space-y-5 justify-center align-middle">
        <h1 class="text-3xl font-bold mt-5">{title || 'Untitled'}</h1>
        <h2 class="text-base font-bold">by
          {#if originalAuthor}
            <InlineProfile pubkey={originalAuthor} />
          {:else}
            {author || 'Unknown'}
          {/if}
        </h2>
        {#if version}
          <h4 class='text-base font-thin mt-2'>Version: {version}</h4>
        {/if}
      </div>
    </div>

    {#if summary}
      <div class="flex flex-row">
        <p class='text-base text-primary-900 dark:text-highlight'>{summary}</p>
      </div>
    {/if}

    <div class="flex flex-row">
      <h4 class='text-base font-normal mt-2'>Index author: <InlineProfile pubkey={event.pubkey} /></h4>
    </div>

    <div class="flex flex-col pb-4 space-y-1">
      {#if source}
        <h5 class="text-sm">Source: <a class="underline" href={source} target="_blank" rel="noopener noreferrer">{source}</a></h5>
      {/if}
      {#if type}
        <h5 class="text-sm">Publication type: {type}</h5>
      {/if}
      {#if language}
        <h5 class="text-sm">Language: {language}</h5>
      {/if}
      {#if publisher}
        <h5 class="text-sm">Published by: {publisher}</h5>
      {/if}
      {#if identifier}
        <h5 class="text-sm">Identifier: {identifier}</h5>
      {/if}
      <a 
        href="/events?id={neventEncode(event, standardRelays)}" 
        class="mt-4 btn-leather text-center text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-semibold"
      >
        View Event Details
      </a>
    </div>
  </Modal>
</div>