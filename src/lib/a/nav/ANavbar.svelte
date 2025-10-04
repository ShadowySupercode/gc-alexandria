<script lang="ts">
  /**
   * @fileoverview ANavbar Component - Alexandria
   *
   * The main navigation bar component with responsive menu, user profile, and theme controls.
   * Provides primary navigation for the Alexandria application with mega menu functionality.
   * This component has no props - it renders a fixed navigation structure.
   *
   * @component
   * @category Navigation
   *
   * @example
   * ```svelte
   * <ANavbar />
   * ```
   *
   * @example Place at top of main layout
   * ```svelte
   * <ANavbar />
   * <main>
   *   <!-- page content -->
   * </main>
   * ```
   *
   * @features
   * - Responsive hamburger menu for mobile devices
   * - Mega menu with categorized navigation items
   * - User profile integration with sign-in/out functionality
   * - Dark mode toggle
   * - Brand logo and home link
   * - Organized menu sections (Browse, Create, Learn, etc.)
   * - Helpful descriptions for each navigation item
   *
   * @navigation
   * - Browse: Publications, Events, Visualize
   * - Create: Compose notes, Publish events
   * - Learn: Getting Started, Relay Status
   * - Profile: User-specific actions and settings
   *
   * @accessibility
   * - Semantic navigation structure with proper ARIA attributes
   * - Keyboard accessible menu items and dropdowns
   * - Screen reader friendly with descriptive labels
   * - Focus management for mobile menu
   * - Proper heading hierarchy
   *
   * @integration
   * - Uses Flowbite Navbar components for consistency
   * - Integrates with Alexandria's theme system
   * - Connects to user authentication state
   * - Responsive design adapts to all screen sizes
   */

  import {
    DarkMode,
    Navbar,
    NavLi,
    NavUl,
    NavHamburger,
    NavBrand,
    MegaMenu,
  } from "flowbite-svelte";
  import Profile from "$components/util/Profile.svelte";

  import { ChevronDownOutline } from "flowbite-svelte-icons";

  let menu2 = [
    { name: "Publications", href: "/", help: "Browse publications" },
    { name: "Events", href: "/events", help: "Search and engage with events" },
    {
      name: "Visualize",
      href: "/visualize",
      help: "Visualize connections between publications and authors",
    },

    {
      name: "Compose notes",
      href: "/new/compose",
      help: "Create individual notes (30041 events)",
    },
    {
      name: "Publish events",
      href: "/events/compose",
      help: "Create any kind",
    },

    {
      name: "Getting Started",
      href: "/start",
      help: "A quick overview and tutorial",
    },
    {
      name: "Relay Status",
      href: "/about/relay-stats",
      help: "Relay status and monitoring",
    },
    { name: "About", href: "/about", help: "About the project" },
    {
      name: "Contact",
      href: "/contact",
      help: "Contact us or submit a bug report",
    },
  ];
</script>

<Navbar
  id="navi"
  class="fixed start-0 top-0 z-50 flex flex-row bg-primary-50 dark:bg-primary-1000"
  navContainerClass="flex-row items-center !p-0"
>
  <NavBrand href="/">
    <div class="flex flex-col">
      <h1
        class="text-2xl font-bold mb-0 dark:text-primary-100 hover:dark:text-highlight"
      >
        Alexandria
      </h1>
      <p
        class="text-xs font-semibold tracking-wide max-sm:max-w-[11rem] mb-0 dark:text-primary-200"
      >
        READ THE ORIGINAL. MAKE CONNECTIONS. CULTIVATE KNOWLEDGE.
      </p>
    </div>
  </NavBrand>
  <div class="flex md:order-2">
    <Profile />
    <NavHamburger />
  </div>
  <NavUl class="order-1 ml-auto items-center" classes={{ ul: "items-center" }}>
    <NavLi class="cursor-pointer">
      Explore<ChevronDownOutline
        class="text-primary-800 ms-2 inline h-6 w-6 dark:text-white"
      />
    </NavLi>
    <MegaMenu items={menu2}>
      {#snippet children({ item })}
        <a
          href={item.href}
          class="block h-full rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <div class="font-semibold dark:text-white">{item.name}</div>
          <span class="text-sm font-light text-gray-500 dark:text-gray-400"
            >{item.help}</span
          >
        </a>
      {/snippet}
    </MegaMenu>
    <DarkMode />
  </NavUl>
</Navbar>
