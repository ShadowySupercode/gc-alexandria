<script lang="ts">
  import {
    DarkMode,
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
    Dropdown,
    DropdownItem
  } from "flowbite-svelte";
  import { siteNav } from "$lib/nav/site-nav.js";
  import { logoutUser, userStore } from "$lib/stores/userStore";
  import Profile from "$components/util/Profile.svelte";
  import type { NavItem } from "$lib/a/nav/nav-types.ts";
  import { goto } from "$app/navigation";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { AThemeToggleMini } from "$lib/a";

  let {
    currentPath = "",
  }: {
    currentPath?: string;
  } = $props();

  let userState = $derived($userStore);

  function handleNavClick(item: NavItem) {
    if (item.href) {
      goto(item.href);
    } else if (item.id === 'logout') {
      logoutUser();
    }
  }

  function flattenNavItems(navItems: NavItem[]): NavItem[] {
    const result: NavItem[] = [];
    for (const item of navItems) {
      if (item.children && item.children.length > 0) {
        result.push(...flattenNavItems(item.children));
      } else {
        result.push(item);
      }
    }
    return result;
  }
</script>

<Navbar class="fixed start-0 top-0 z-50 flex flex-row bg-primary-50 dark:bg-primary-800 !p-0" navContainerClass="w-full flex-row justify-between items-center !p-0">
    <NavBrand href="/">
      <h1>Alexandria</h1>
    </NavBrand>
    <div class="flex md:order-2">
      <Profile isNav={true} pubkey={userState?.npub || undefined} />
      <NavHamburger />
    </div>
    <NavUl class="order-1" activeUrl={currentPath}>
      {#each siteNav as navSection}
        {#if navSection.children && navSection.children.length > 0}
          <NavLi class="cursor-pointer">
            {navSection.title}<ChevronDownOutline class="text-primary-800 ms-2 inline h-6 w-6 dark:text-white" />
          </NavLi>
          <Dropdown simple class="w-44 z-20">
            {#each flattenNavItems(navSection.children) as item}
              <DropdownItem
                href={item.href || undefined}
                onclick={() => handleNavClick(item)}
              >
                {item.title}
              </DropdownItem>
            {/each}
          </Dropdown>
        {:else if navSection.href}
          <NavLi href={navSection.href}>{navSection.title}</NavLi>
        {/if}
      {/each}
      <NavLi>
        <DarkMode class="btn-leather p-0" />
      </NavLi>
      <AThemeToggleMini />
    </NavUl>
</Navbar>
