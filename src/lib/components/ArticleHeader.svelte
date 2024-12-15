<script lang="ts">
  import { page } from "$app/stores";
  import { neventEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { standardRelays } from "../consts";
  import { Card, Button, Modal, Tooltip } from "flowbite-svelte";
  import { ClipboardCheckOutline, ClipboardCleanOutline, CodeOutline, ShareNodesOutline } from "flowbite-svelte-icons";
  import { ndk } from "../ndk";

  export let event: NDKEvent;

  let title: string;
  let author: string;
  let href: string;

  $: try {
    const relays = $ndk.activeUser?.relayUrls ?? standardRelays;
    title = event.getMatchingTags('title')[0][1];
    author = event.getMatchingTags('author')[0][1];

    const d = event.getMatchingTags('d')[0][1];
    if (d != null) {
      href = `publication?d=${d}`;
    } else {
      href = `publication?id=${neventEncode(event, relays)}`;
    }
  } catch (e) {
    console.warn(e);
  }

  let eventIdCopied: boolean = false;
  function copyEventId() {
    console.debug("copyEventID");
    const relays: string[] = standardRelays;
    const naddr = neventEncode(event, relays);

    navigator.clipboard.writeText(naddr);

    eventIdCopied = true;
  }

  let jsonModalOpen: boolean = false;
  function viewJson() {
    console.debug("viewJSON");
    const relays: string[] = standardRelays;
    const naddr = neventEncode(event, relays);
    jsonModalOpen = true;
  }

  let shareLinkCopied: boolean = false;
  function shareNjump() {
    const relays: string[] = standardRelays;
    const naddr = neventEncode(event, relays);

    console.debug(naddr);
    navigator.clipboard.writeText(`njump.me/${naddr}`);

    shareLinkCopied = true;
  }
</script>

{#if title != null && href != null}
  <Card class='ArticleBox card-leather w-lg'>
    <div class='flex flex-col space-y-4'>
      <a href="/{href}" class='flex flex-col space-y-2'>
        <h2 class='text-lg font-bold'>{title}</h2>
        <h3 class='text-base font-normal'>by {author}</h3>
      </a>
      <div class='w-full flex space-x-2 justify-end'>
        <Button class='btn-leather' size='xs' on:click={shareNjump}><ShareNodesOutline /></Button>
        <Tooltip class='tooltip-leather' type='auto' placement='top' on:show={() => shareLinkCopied = false}>
          {#if shareLinkCopied}
            <ClipboardCheckOutline />
          {:else}
            Share via NJump
          {/if}
        </Tooltip>
        <Button class='btn-leather' size='xs' outline on:click={copyEventId}><ClipboardCleanOutline /></Button>
        <Tooltip class='tooltip-leather' type='auto' placement='top' on:show={() => eventIdCopied = false}>
          {#if eventIdCopied}
            <ClipboardCheckOutline />
          {:else}
            Copy event ID
          {/if}
        </Tooltip>
        <Button class='btn-leather' size='xs' outline on:click={viewJson}><CodeOutline /></Button>
        <Tooltip class='tooltip-leather' type='auto' placement='top'>View JSON</Tooltip>
      </div>
    </div>
    <Modal class='modal-leather' title='Event JSON' bind:open={jsonModalOpen} autoclose outsideclose size='sm'>
      <code>{JSON.stringify(event.rawEvent())}</code>
    </Modal>
  </Card>
{/if}
