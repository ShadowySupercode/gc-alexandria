<script lang="ts">
  import {
    DarkMode,
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
  } from "flowbite-svelte";
  import Profile from "./util/Profile.svelte";
  import { userStore } from "$lib/nostr/utils/auth/auth.ts";

  let { class: className = "" } = $props();
  
  let userState = $derived($userStore);
</script>

<Navbar class={`Navbar navbar-leather navbar-main ${className}`}>
  <div class="flex flex-grow justify-between">
    <NavBrand href="/">
      <h1>Alexandria</h1>
    </NavBrand>
  </div>
  <div class="flex md:order-2">
    <Profile isNav={true} />
    <NavHamburger class="btn-leather" />
  </div>
  <NavUl class="ul-leather">
    <NavLi href="/">Publications</NavLi>
    <NavLi href="/new/compose">Compose</NavLi>
    <NavLi href="/visualize">Visualize</NavLi>
    <NavLi href="/start">Getting Started</NavLi>
    <NavLi href="/events">Events</NavLi>
    <NavLi href="/my-notes">My Notes</NavLi>
    <NavLi href="/about">About</NavLi>
    <NavLi href="/contact">Contact</NavLi>
    <NavLi>
      <DarkMode btnClass="btn-leather p-0" />
    </NavLi>
  </NavUl>
</Navbar>
