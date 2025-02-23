<script lang="ts">
  import {
    DarkMode,
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
    Toggle
  } from "flowbite-svelte";
  import { apiKey, advancedMode } from "$lib/stores/apiKey";
  import Login from "./Login.svelte";

  let { class: className = "" } = $props();
</script>

<Navbar class={`Navbar navbar-leather ${className}`}>
  <div class="flex flex-grow">
    <NavBrand href="/">
      <h1 class="font-serif">Alexandria</h1>
    </NavBrand>
  </div>

  <NavUl class="ul-leather">
    <NavLi href="/new/edit">New Note</NavLi>
    <NavLi href="/visualize">Visualize</NavLi>
    <NavLi href="/about">About</NavLi>
    <NavLi>
      <DarkMode btnClass="btn-leather p-0" />
    </NavLi>
  </NavUl>

  <div class="flex md:order-2 items-center space-x-2">
    <Toggle bind:checked={$advancedMode} class="mr-3">Chat</Toggle>
    <Login />
    <NavHamburger class="btn-leather" />
  </div>
</Navbar>