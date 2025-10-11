<script>
/**
 * @fileoverview AFooter Component - Alexandria
 *
 * A standardized footer component with copyright information and navigation links.
 * Uses Flowbite's Footer components with Alexandria-specific styling and content.
 * This component has no props - it renders a fixed footer structure.
 *
 * @component
 * @category Navigation
 *
 * @example
 * ```svelte
 * <AFooter />
 * ```
 *
 * @example Place at bottom of layout
 * ```svelte
 * <main>
 *   <!-- page content -->
 * </main>
 * <AFooter />
 * ```
 *
 * @features
 * - Copyright notice with GitCitadel attribution
 * - Navigation links to About and Contact pages
 * - Responsive layout that adapts to screen size
 * - Consistent styling with Alexandria theme
 * - Links to creator's nostr profile
 *
 * @accessibility
 * - Semantic footer structure
 * - Keyboard accessible navigation links
 * - Screen reader friendly with proper link text
 * - Responsive design for various screen sizes
 *
 * @integration
 * - Typically placed at the bottom of page layouts
 * - Uses Flowbite Footer components for consistency
 * - Matches Alexandria's overall design system
 */

  import {
    Footer,
    FooterCopyright,
    FooterLink,
    FooterLinkGroup,
  } from "flowbite-svelte";
</script>

<Footer class="m-2">
  <FooterCopyright
    href="/events?id=npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz"
    by="GitCitadel"
    year={2025}
  />
  <FooterLinkGroup
    class="mt-3 flex flex-wrap items-center text-sm text-gray-500 sm:mt-0 dark:text-gray-400"
  >
    <FooterLink href="/about">About</FooterLink>
    <FooterLink href="/contact">Contact</FooterLink>
  </FooterLinkGroup>
</Footer>
