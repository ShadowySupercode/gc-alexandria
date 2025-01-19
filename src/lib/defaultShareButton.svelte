<script lang="ts">
  import { ndk } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { neventEncode } from "$lib/utils.ts";
  import { nip19 } from "nostr-tools";
  import { standardRelays } from "./consts";
  import Modal from "$lib/Modal.svelte";

  export let event: NDKEvent;
  // const eventString: string = JSON.stringify(event);
  // event.toString();
  let modal = false;

  function copyEventID() {
    console.debug("copyEventID");
    const relays: string[] = standardRelays;
    const naddr = neventEncode(event, relays);
    navigator.clipboard.writeText(naddr);
  }
  function viewJSON() {
    console.debug("viewJSON");
    modal = !modal;
    console.debug(modal);
  }

  function shareNjump() {
    const relays: string[] = standardRelays;
    const naddr = neventEncode(event, relays);
    console.debug(naddr);
    navigator.clipboard.writeText(`https://njump.me/${naddr}`);
  }
</script>

<div class="dropdown">
  <button class="dropbtn">
    <div class="dot" />
    <div class="dot" />
    <div class="dot" />
  </button>

  <div class="dropdown-content">
    <a on:click={copyEventID}>Copy Event ID</a>
    <!-- <a on:click={viewJSON}>View JSON</a> -->
    <a on:click={shareNjump}>Share (njump)</a>
  </div>
</div>
<Modal showModal={modal} {event} />

<style>
  .dropdown {
    position: relative;
    display: inline-block;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-color: green;
    /* boarder-width: 100px; */
  }
  .dropbtn {
    color: white;
    grid-column: 2;
    margin: 50px;
    padding: 16px;
    font-size: 16px;
    border: none;
    cursor: pointer;
    border: 1px solid red;
  }
  .dot {
    height: 9px;
    width: 9px;
    background-color: white;
    border-radius: 50%;
    display: inline-block;
    margin: 0 5px;
  }

  /* The container <div> - needed to position the dropdown content */

  /* Dropdown Content (Hidden by Default) */
  .dropdown-content {
    display: none;
    position: absolute;
    background-color: #f9f9f9;
    min-width: 160px;
    box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  /* Links inside the dropdown */
  .dropdown-content a {
    color: black;
    padding: 12px 16px;
    text-decoration: none;
    display: block;
  }

  /* Change color of dropdown links on hover */
  .dropdown-content a:hover {
    background-color: #cacaca;
  }

  /* Show the dropdown menu on hover */
  .dropdown:hover .dropdown-content {
    display: block;
  }

  /* Change the background color of the dropdown button when the dropdown content is shown */
  .dropdown:hover .dropbtn {
    /* background-color: #3e8e41; */
  }
</style>
