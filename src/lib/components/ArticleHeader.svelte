<script lang="ts">
  import { ndkInstance } from '$lib/ndk';
  import { neventEncode } from '$lib/utils';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { naddrEncode, type AddressPointer } from 'nostr-tools/nip19';
  import { standardRelays } from '../consts';
  import { Card, Button, Modal, Tooltip } from 'flowbite-svelte';
  import { ClipboardCheckOutline, ClipboardCleanOutline, CodeOutline, ShareNodesOutline } from 'flowbite-svelte-icons';

  const { event } = $props<{ event: NDKEvent }>();

  const relays = $derived.by(() => {
    return $ndkInstance.activeUser?.relayUrls ?? standardRelays;
  });

  const href = $derived.by(() => {
    const d = event.getMatchingTags('d')[0]?.[1];
    if (d != null) {
      return `publication?d=${d}`;
    } else {
      return `publication?id=${neventEncode(event, relays)}`;
    }
  });

  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(event.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let version: string = $derived(event.getMatchingTags('version')[0]?.[1] ?? '1');

  let eventIdCopied: boolean = $state(false);
  let jsonModalOpen: boolean = $state(false);
  let shareLinkCopied: boolean = $state(false);

  function copyEventId() {
    console.debug("copyEventID");
    const relays: string[] = standardRelays;
    const nevent = neventEncode(event, relays);

    navigator.clipboard.writeText(nevent);

    eventIdCopied = true;
  }

  function viewJson() {
    console.debug("viewJSON");
    jsonModalOpen = true;
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
