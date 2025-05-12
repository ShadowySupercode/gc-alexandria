<script lang="ts">
  import { DarkMode, Navbar, NavLi, NavUl, NavHamburger, NavBrand } from 'flowbite-svelte';
  import Login from './Login.svelte';

  let { class: className = '' } = $props();

  let leftMenuOpen = $state(false);
</script>

<Navbar class={`nav-container ${className}`}>
  <div class="nav-content">
    <NavBrand href="/" class="nav-brand">
      <h1>Alexandria</h1>
    </NavBrand>
  </div>
  <div class="nav-links">
    <Login />
    <NavHamburger class="btn-base" />
  </div>
  <NavUl class="nav-links">
    <NavLi href="/new/edit" class="nav-link">Publish</NavLi>
    <NavLi href="/visualize" class="nav-link">Visualize</NavLi>
    <NavLi href="/about" class="nav-link">About</NavLi>
    <NavLi href="/contact" class="nav-link">Contact</NavLi>
    <NavLi>
      <DarkMode btnClass="btn-base no-padding" />
    </NavLi>
  </NavUl>
</Navbar>
