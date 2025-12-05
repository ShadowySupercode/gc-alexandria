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
  import { userStore } from "$lib/stores/userStore";

  let { class: className = "" } = $props();

  let userState = $derived($userStore);
</script>

<Navbar class={`Navbar navbar-leather navbar-main ${className}`}>
  <div class="flex flex-grow justify-between">
    <NavBrand href="/">
      <div class="flex flex-col">
        <h1 class="text-2xl font-bold">Alexandria</h1>
        <p class="text-xs font-semibold tracking-wide max-sm:max-w-[11rem]">
          READ THE ORIGINAL. MAKE CONNECTIONS. CULTIVATE KNOWLEDGE.
        </p>
      </div>
    </NavBrand>
  </div>
  <div class="flex md:order-2">
    <Profile />
    <NavHamburger class="btn-leather" />
  </div>
  <NavUl class="ul-leather">
    <NavLi href="/">Publications</NavLi>
    <NavLi href="/new/compose">Compose</NavLi>
    <NavLi href="/visualize">Visualize</NavLi>
    <NavLi href="/start">Getting Started</NavLi>
    <NavLi href="/events">Events</NavLi>
    {#if userState.signedIn}
      <NavLi href="/my-notes">My Notes</NavLi>
    {/if}
    <NavLi href="/about">About</NavLi>
    <NavLi href="/contact">Contact</NavLi>
    <NavLi>
      <DarkMode class="btn-leather p-0" />
    </NavLi>
  </NavUl>
</Navbar>
