<script lang="ts">
  import {
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
  } from "flowbite-svelte";
  import Login from "./Login.svelte";

  let { class: className = "" } = $props();

  console.log('[Navigation] Navigation.svelte loaded');
</script>

<Navbar class={`Navbar navbar-leather navbar-main ${className}`}>
  <div class="flex flex-grow justify-between">
    <NavBrand href="/">
      <h1>Alexandria</h1>
    </NavBrand>
  </div>
  <div class="flex md:order-2">
    <Login />
    <NavHamburger class="btn-leather" />
  </div>
  <NavUl class="ul-leather">
    <NavLi href="/">Publications</NavLi>
    <NavLi href="/visualize">Visualize</NavLi>
    <NavLi href="/start">Getting Started</NavLi>
    <NavLi href="/events">Events</NavLi>
    <NavLi href="/about">About</NavLi>
    <NavLi href="/contact">Contact</NavLi>
  </NavUl>
</Navbar>
