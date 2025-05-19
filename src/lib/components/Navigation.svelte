<script lang="ts">
  import {
    DarkMode,
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
  } from "flowbite-svelte";
  import Login from "./Login.svelte";

  let { class: className = "" } = $props();

</script>

<Navbar class={`Navbar navbar-leather ${className}`}>
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
    <NavLi href="/wiki">Wiki</NavLi>
    <NavLi href="/events">Events</NavLi>
    <NavLi href="/visualize">Visualize</NavLi>
    <NavLi href="/start">Getting Started</NavLi>
    <NavLi href="/about">About</NavLi>
    <NavLi href="/contact">Contact</NavLi>
    <NavLi>
      <DarkMode btnClass="btn-leather p-0" />
    </NavLi>
  </NavUl>
</Navbar>
