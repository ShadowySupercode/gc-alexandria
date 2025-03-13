<script lang="ts">
  import {
    ClipboardCheckOutline,
    ClipboardCleanOutline,
    CodeOutline,
    DotsVerticalOutline,
    EyeOutline,
    ShareNodesOutline
  } from "flowbite-svelte-icons";
  import { Button, Modal, Popover } from "flowbite-svelte";
  import { standardRelays } from "$lib/consts";
  import { neventEncode } from "$lib/utils";
  import { type AddressPointer, naddrEncode } from "nostr-tools/nip19";
  import InlineProfile from "$components/util/InlineProfile.svelte";

  let { event } = $props();

  let jsonModalOpen: boolean = $state(false);
  let detailsModalOpen: boolean = $state(false);
  let eventIdCopied: boolean = $state(false);
  let shareLinkCopied: boolean = $state(false);
  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(event.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let version: string = $derived(event.getMatchingTags('version')[0]?.[1] ?? '1');
  let image: string = $derived(event.getMatchingTags('image')[0]?.[1] ?? null);
  let originalAuthor: string = $derived(event.getMatchingTags('p')[0]?.[1] ?? null);
  let summary: string = $derived(event.getMatchingTags('summary')[0]?.[1] ?? null);
  let type: string = $derived(event.getMatchingTags('type')[0]?.[1] ?? null);
  let language: string = $derived(event.getMatchingTags('l')[0]?.[1] ?? null);

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
    const dTag : string | undefined = event.dTag;

    if (typeof dTag === 'string') {
      const opts: AddressPointer = {
        identifier: dTag,
        pubkey: event.pubkey,
        kind: 30040,
        relays
      };
      const naddr = naddrEncode(opts);
      console.debug(naddr);
      navigator.clipboard.writeText(`https://njump.me/${naddr}`);
      shareLinkCopied = true;
      setTimeout(() => {
        shareLinkCopied = false;
      }, 4000);
    }

    else {
      console.log('dTag is undefined');
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
    console.log('Details');
    detailsModalOpen = true;
  }

</script>

<div class="group" role="group" onmouseenter={openPopover}>
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
            <a role="button" class='btn-leather' onclick={shareNjump}>
              {#if shareLinkCopied}
                <ClipboardCheckOutline class="inline mr-2" /> Copied!
              {:else}
                <ShareNodesOutline class="inline mr-2" /> Share via NJump
              {/if}
            </a>
          </li>
          <li>
            <a role="button" class='btn-leather' onclick={copyEventId}>
              {#if eventIdCopied}
                <ClipboardCheckOutline class="inline mr-2" /> Copied!
              {:else}
                <ClipboardCleanOutline class="inline mr-2" /> Copy event ID
              {/if}
            </a>
          </li>
          <li>
            <a href="" role="button" class='btn-leather' onclick={viewJson}>
              <CodeOutline class="inline mr-2"  /> View JSON
            </a>
          </li>
          <li>
            <a href="" role="button" class='btn-leather' onclick={viewDetails}>
              <EyeOutline class="inline mr-2"  /> View details
            </a>
          </li>
        </ul>
      </div>
    </div>
  </Popover>
  {/if}
  <!-- Event JSON -->
  <Modal class='modal-leather' title='Event JSON' bind:open={jsonModalOpen} autoclose outsideclose size='sm'>
    <div class="overflow-auto bg-highlight dark:bg-primary-900 text-sm rounded p-1">
      <code>{JSON.stringify(event.rawEvent())}</code>
    </div>
  </Modal>
  <!-- Event details -->
  <Modal class='modal-leather' title='Publication details' bind:open={detailsModalOpen} autoclose outsideclose size='sm'>
    <div class="flex flex-row space-x-4">
      {#if image}
      <div class="flex col">
        <img class="max-w-48" src={image} />
      </div>
      {/if}
      <div class="flex flex-col col space-y-5  justify-center  align-middle">
        <h1 class="text-3xl font-bold mt-5">{title}</h1>
        <h2 class="text-base font-bold">by
          {#if originalAuthor !== null}
            <InlineProfile pubkey={originalAuthor} title={author} />
          {:else}
            {author}
          {/if}
        </h2>
        <h4 class='text-base font-thin mt-2'>Version: {version}</h4>
      </div>
    </div>

    {#if summary}
      <div class="flex flex-row ">
        <p class='text-base text-primary-900 dark:text-highlight'>{summary}</p>
      </div>
    {/if}

    <div class="flex flex-row ">
      <h4 class='text-base font-normal mt-2'>Index author: <InlineProfile pubkey={event.pubkey} /></h4>
    </div>

    <div class="flex flex-col pb-4">
      {#if type !== null}
        <h5 class="text-sm">Publication type: {type}</h5>
      {/if}
      {#if language !== null}
        <h5 class="text-sm">Language: {language}</h5>
      {/if}

    </div>

  </Modal>
</div>
