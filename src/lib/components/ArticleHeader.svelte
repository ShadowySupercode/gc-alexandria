<script lang="ts">
  import { neventEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { standardRelays } from "../consts";
  import { Card, Button, Modal, Tooltip } from "flowbite-svelte";
  import { ClipboardCheckOutline, ClipboardCleanOutline, CodeOutline, ShareNodesOutline } from "flowbite-svelte-icons";
  import { naddrEncode, type AddressPointer } from 'nostr-tools/nip19';
  import { ndkInstance } from "$lib/ndk";

  export let event: NDKEvent;

  let title: string;
  let author: string;
  let version: string;
  let href: string;

  $: try {
    const relays = $ndkInstance.activeUser?.relayUrls ?? standardRelays;
    title = event.getMatchingTags('title')[0][1];
    if (event.getMatchingTags('author')[0][1] != ''){
      author = event.getMatchingTags('author')[0][1];
    } else {
      author = 'unknown';
    }
    if (event.getMatchingTags('version')[0][1] != ''){
      version = event.getMatchingTags('version')[0][1];
    } else {
      version = '1';
    }

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
    const nevent = neventEncode(event, relays);

    navigator.clipboard.writeText(nevent);

    eventIdCopied = true;
  }

  let jsonModalOpen: boolean = false;
  function viewJson() {
    console.debug("viewJSON");
    jsonModalOpen = true;
  }

  let shareLinkCopied: boolean = false;
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
        }
  
        else {
            console.log('dTag is undefined');
          }
            
}

</script>

{#if title != null && href != null}
  <Card class='ArticleBox card-leather w-lg'>
    <div class='flex flex-col space-y-4'>
      <a href="/{href}" class='flex flex-col space-y-2'>
        <h2 class='text-lg font-bold'>{title}</h2>
        <h3 class='text-base font-normal'>by {author}</h3>
        {#if version != '1'}
        <h3 class='text-base font-normal'>version: {version}</h3>
        {/if}
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
