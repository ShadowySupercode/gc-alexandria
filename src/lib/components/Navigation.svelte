<script lang="ts">
  import {
    DarkMode,
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
    Toggle,
  } from "flowbite-svelte";
  import { apiKey, advancedMode } from "$lib/stores/apiKey";
  import Login from "./Login.svelte";
  import ApiKeyEntry from "./ApiKeyEntry.svelte";

  let { class: className = "" } = $props();
  let isDrawerOpen = $state(false);

  $effect(() => {
    if (!$advancedMode) {
      isDrawerOpen = false;
    } else if (!$apiKey) {
      isDrawerOpen = true;
    }
  });
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

  <div class="flex md:order-2 items-center ml-4">
    <Toggle bind:checked={$advancedMode} class="mr-3">Advanced</Toggle>
    <Login />
    <NavHamburger class="btn-leather" />
  </div>
</Navbar>

{#if isDrawerOpen}
  <ApiKeyEntry />
{/if}