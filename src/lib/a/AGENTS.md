# Alexandria Component Library - AI Agent Guide

**Version:** 1.0.0  
**Last Updated:** October 4, 2025

This guide provides comprehensive instructions for AI agents working with the Alexandria UI component library. Following these guidelines ensures consistency, maintainability, and proper integration with the existing codebase.

---

## Core Principles

### 1. Always Check Before Creating
Before creating any new UI component, **you must**:
1. Search the existing component library in `src/lib/a/`
2. Review `alexandria-components.json` for available components
3. Check if an existing component can be reused or extended
4. Only create new components when absolutely necessary

### 2. Use alexandria-components.json as Your Reference
The `alexandria-components.json` file is the **single source of truth** for all available components. It contains:
- Complete component inventory (18 components across 5 categories)
- Full prop definitions with types and defaults
- Usage examples and patterns
- Features and accessibility information

**Always consult this file first** when selecting components.

### 3. Maintain TSDoc Documentation Standards
All components use **TSDoc format** for documentation. You must maintain this standard when creating or modifying components.

---

## Component Inventory

### Available Categories
1. **Primitives** (8 components) - Basic UI building blocks
2. **Navigation** (2 components) - App navigation elements
3. **Forms** (4 components) - Input and editing interfaces
4. **Cards** (2 components) - Content display cards
5. **Reader** (2 components) - Technical content controls

---

## Component Selection Workflow

### Step 1: Identify the Need
Determine what UI functionality is required:
- User input? → Check **Forms** category
- Display content? → Check **Cards** category
- Navigation? → Check **Navigation** category
- Basic UI element? → Check **Primitives** category
- Technical content toggle? → Check **Reader** category

### Step 2: Search alexandria-components.json

For example: Finding a component for user profiles

- Search for: "profile", "user", or relevant keywords
- Result: AProfilePreview and ANostrUser are available

### Step 3: Review Component Props
Check the component's props in `alexandria-components.json`:
```json
{
  "name": "AEventPreview",
  "props": [
    {
      "name": "event",
      "type": ["NDKEvent"],
      "required": true,
      "description": "The nostr event to display (required)"
    },
    {
      "name": "showContent",
      "type": ["boolean"],
      "description": "Whether to show event content",
      "required": false
    }
    // ... more props
  ]
}
```

### Step 4: Review Examples
Check the `examples` array in `alexandria-components.json` for usage patterns.

---

## TSDoc Documentation Standard

### Required Documentation Structure

Every component **must** include TSDoc comments following this exact format:

````typescript
/**
 * @fileoverview ComponentName Component - Alexandria
 *
 * A brief description of what the component does and its primary purpose.
 * Can span multiple lines for detailed explanation.
 *
 * @component
 * @category [Primitives|Navigation|Forms|Cards|Reader]
 *
 * @prop {type} [propName] - Prop description (if optional)
 * @prop {type} propName - Prop description (if required)
 * @prop {type} [propName=defaultValue] - Prop with default value
 *
 * @example
 * ```svelte
 *    <ComponentName requiredProp={value} optionalProp={value} ></ComponentName>
 * ```
 *
 *
 * @features
 * - Feature 1
 * - Feature 2
 * - Feature 3
 *
 * @accessibility
 * - Accessibility feature 1
 * - ARIA compliance notes
 * - Keyboard navigation details
 */
````

### TSDoc Tags Reference

| Tag | Purpose | Required | Example |
|-----|---------|----------|---------|
| `@fileoverview` | Component name and description | ✅ Yes | `@fileoverview AAlert Component - Alexandria` |
| `@component` | Marks file as Svelte component | ✅ Yes | `@component` |
| `@category` | Component category | ✅ Yes | `@category Primitives` |
| `@prop` | Define component properties | ✅ Yes | `@prop {string} [color] - Alert color theme` |
| `@example` | Usage examples with code | ✅ Yes | See format above |
| `@features` | List key functionality | ✅ Yes | `- Responsive layout` |
| `@accessibility` | Accessibility notes | ✅ Yes | `- ARIA compliant` |
| `@since` | Version introduced | ⚠️ Optional | `@since 1.0.0` |

---

## Component Import Patterns

### Import
```typescript
import { AAlert, AEventPreview, AMarkupForm } from '$lib/a';
```

---

## Creating New Components

### When to Create a New Component

**DO create a new component when:**
- No existing component provides the required functionality
- The component will be reused in 3+ places
- It represents a distinct, standalone UI pattern
- It follows the Alexandria design system

**DON'T create a new component when:**
- An existing component can be configured to meet needs
- It's only used once (keep in parent component)
- It's too generic (use Flowbite components directly)
- It doesn't fit the Alexandria design system

### New Component Checklist

- [ ] **Verify** no existing component can be used
- [ ] **Choose** appropriate category (Primitives/Navigation/Forms/Cards/Reader)
- [ ] **Name** following convention: `A[ComponentName].svelte`
- [ ] **Add TSDoc** documentation following standard format
- [ ] **Create** component file in correct category folder
- [ ] **Add styles** to appropriate `/src/styles/a/` CSS file (or create new file if needed)
- [ ] **Import new CSS file** in `app.css` if created
- [ ] **Export** component in `index.ts`
- [ ] **Update** `alexandria-components.json` (run parse script)
- [ ] **Test** component functionality
- [ ] **Validate** accessibility compliance

### Component Template

````svelte
<script lang="ts">
/**
 * @fileoverview AYourComponent Component - Alexandria
 *
 * Brief description of what this component does and why it exists.
 *
 * @component
 * @category [Primitives|Navigation|Forms|Cards|Reader]
 *
 * @prop {type} [propName] - Description
 *
 * @example
 * ```svelte
 * <AYourComponent prop={value} />
 * ```
 *
 * @features
 * - Feature description
 *
 * @accessibility
 * - Accessibility feature
 */

import { /* Flowbite components */ } from "flowbite-svelte";

let {
  propName = $bindable("default"),
  // ... other props
} = $props<{
  propName?: string;
}>();

// Component logic
</script>

<!-- Component template -->
<div class="themed-container">
  <!-- Component markup -->
</div>
````

---

## Updating alexandria-components.json

### When to Update
You **must** update `alexandria-components.json` whenever:
- A new component is created
- Component props are added, modified, or removed
- Component examples are updated
- Component features or accessibility notes change
- Component documentation is enhanced

### How to Update

1. **Make your changes** to component TSDoc comments
2. **Run the parser script**:
   ```bash
   cd src/lib/a
   node parse-components.js
   ```
3. **Verify** the generated JSON is valid
4. **Commit** both the component file and updated JSON

### Parser Script Location
- **File:** `src/lib/a/parse-components.js`
- **Purpose:** Extracts TSDoc from all `.svelte` files in the library
- **Output:** `alexandria-components.json`

### Manual Updates (When Necessary)
If the parser doesn't capture something correctly:
1. First, try to fix the TSDoc format
2. Re-run the parser
3. Only manually edit JSON as last resort
4. Document any manual changes in comments

---

## Design System Integration

### Theme Compatibility
All Alexandria components support:
- Light and dark themes
- "Leather" aesthetic (warm browns, tans)
- Flowbite-based styling
- Tailwind CSS utilities

### Styling Guidelines

**DO:**
- Use Tailwind CSS classes
- Leverage Flowbite Svelte components as base
- Follow existing color patterns in library
- Ensure responsive design (mobile-first)
- Test in both light and dark modes

**DON'T:**
- Add arbitrary custom CSS without justification
- Override Flowbite's accessibility features
- Hard-code colors (use theme tokens)
- Create layout inconsistencies

### Component Styling Pattern
```svelte
<!-- Use Flowbite component as base -->
<Alert color="info" class="leather-theme">
  <!-- Alexandria-specific theming applied via class -->
</Alert>
```

---

## Styling Architecture (CRITICAL)

### **Mandatory Styling Rules**

⚠️ **ALL custom styles for Alexandria components MUST go in the `/src/styles/a/` folder.**

**DO NOT add `<style>` blocks inside component `.svelte` files unless absolutely necessary for component-scoped styles that cannot be reused.**

### Directory Structure

```
src/
├── styles/
│   └── a/
│       ├── cards.css       ← Styles for Card components
│       ├── forms.css       ← Styles for Form components
│       ├── primitives.css  ← Styles for Primitive components
│       ├── nav.css         ← Styles for Navigation components (create if needed)
│       └── reader.css      ← Styles for Reader components (create if needed)
├── app.css                 ← Main CSS file that imports all styles
└── lib/
    └── a/
        ├── cards/          ← Component files (minimal/no styles)
        ├── forms/          ← Component files (minimal/no styles)
        ├── primitives/     ← Component files (minimal/no styles)
        ├── nav/            ← Component files (minimal/no styles)
        └── reader/         ← Component files (minimal/no styles)
```

### Styling Workflow

#### 1. **Determine Component Category**
Identify which category your component belongs to:
- `primitives/` → `styles/a/primitives.css`
- `forms/` → `styles/a/forms.css`
- `cards/` → `styles/a/cards.css`
- `nav/` → `styles/a/nav.css`
- `reader/` → `styles/a/reader.css`

#### 2. **Check if Style File Exists**
Before adding styles, verify the corresponding CSS file exists in `src/styles/a/`:

**Existing files:**
- ✅ `styles/a/cards.css`
- ✅ `styles/a/forms.css`
- ✅ `styles/a/primitives.css`

**Files to create when needed:**
- ⚠️ `styles/a/nav.css` (create for navigation components)
- ⚠️ `styles/a/reader.css` (create for reader components)

#### 3. **Create New Style File (If Needed)**

If the CSS file doesn't exist for your category:

**Step A: Create the file**
```bash
# Create the new CSS file
type nul > src\styles\a\nav.css
```

**Step B: Add the CSS structure**
```css
/* src/styles/a/nav.css */
/* Alexandria Navigation Component Styles */

@layer components {
  /* ANavbar styles */
  .navbar-alexandria {
    @apply /* your Tailwind classes */;
  }

  /* AFooter styles */
  .footer-alexandria {
    @apply /* your Tailwind classes */;
  }
}
```

**Step C: Import in app.css**
Add the import to `src/app.css` in the correct location, after existing imports.


#### 4. **Add Component Styles**

Add your styles to the appropriate file using the `@layer components` directive:

```css
/* Example: src/styles/a/primitives.css */

@layer components {
  /* AAlert component styles */
  .alert-leather {
    @apply border border-s-4;
    @apply bg-primary-50 dark:bg-primary-1000;
    @apply text-gray-900 dark:text-gray-100;
  }

  /* AInput component styles */
  .input-alexandria {
    @apply bg-primary-50 dark:bg-primary-1000;
    @apply border-s-4 border-primary-200;
    @apply focus:border-primary-600 dark:focus:border-primary-400;
  }

  /* ANostrBadge component styles */
  .badge-alexandria {
    @apply inline-flex space-x-1 items-center;
    @apply text-primary-600 dark:text-primary-500;
    @apply border border-primary-600 dark:border-primary-500;
  }
}
```

#### 5. **Use Classes in Components**

Reference the CSS classes in your Svelte components:

```svelte
<script lang="ts">
/**
 * @fileoverview AAlert Component - Alexandria
 * ...TSDoc
 */
import { Alert } from "flowbite-svelte";

let { color = "info", dismissable = false } = $props();
</script>

<!-- Use the CSS class from styles/a/primitives.css -->
<Alert {color} {dismissable} class="alert-leather">
  {@render children?.()}
</Alert>
```

### CSS Organization Best Practices

#### Naming Conventions
- Use descriptive, component-specific class names
- Prefix with component name or category
- Use `-leather` or `-alexandria` suffix for themed styles
- Examples:
  - `.alert-leather`
  - `.card-alexandria`
  - `.navbar-main-leather`
  - `.form-input-alexandria`

#### File Structure Within CSS Files
Organize styles by component within each file:

```css
/* src/styles/a/forms.css */

@layer components {
  /* ========================================
   * AMarkupForm Component
   * ======================================== */
  .markup-form-container {
    @apply /* styles */;
  }

  .markup-form-header {
    @apply /* styles */;
  }

  /* ========================================
   * ACommentForm Component
   * ======================================== */
  .comment-form-wrapper {
    @apply /* styles */;
  }

  .comment-form-textarea {
    @apply /* styles */;
  }

  /* ========================================
   * ATextareaWithPreview Component
   * ======================================== */
  .textarea-preview-container {
    @apply /* styles */;
  }

  .textarea-toolbar {
    @apply /* styles */;
  }
}
```

#### Use Tailwind @apply Directive
Prefer `@apply` with Tailwind utilities over custom CSS:

```css
/* ✅ GOOD: Using Tailwind utilities */
.card-leather {
  @apply shadow-none text-primary-1000 border-s-4 bg-highlight;
  @apply border-primary-200 has-[:hover]:border-primary-700;
  @apply dark:bg-primary-1000 dark:border-primary-800;
}

/* ❌ AVOID: Custom CSS properties */
.card-leather {
  box-shadow: none;
  color: #1a1a1a;
  border-left: 4px solid #e5d5c5;
  background: #f9f6f1;
}
```

### When Component-Scoped Styles Are Acceptable

Use `<style>` blocks in `.svelte` files ONLY when:
1. **Truly unique** - Style is used nowhere else and never will be
2. **Animation keyframes** - Component-specific animations
3. **CSS variables** - Component-specific custom properties
4. **Pseudo-elements** - Complex ::before/::after that can't use Tailwind

```svelte
<!-- Acceptable use of component-scoped styles -->
<style>
  /* Unique animation for this component only */
  @keyframes pulse-custom {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .loading-indicator {
    animation: pulse-custom 2s infinite;
  }
</style>
```

### Checklist for Adding Styles

- [ ] Identified component category (primitives/forms/cards/nav/reader)
- [ ] Checked if corresponding CSS file exists in `src/styles/a/`
- [ ] Created new CSS file if needed (e.g., `nav.css`, `reader.css`)
- [ ] Added import to `src/app.css` for new CSS file
- [ ] Used `@layer components` directive
- [ ] Followed naming conventions (`-leather` or `-alexandria` suffix)
- [ ] Used Tailwind `@apply` directive instead of custom CSS
- [ ] Added comments to organize styles by component
- [ ] Tested in both light and dark themes
- [ ] Verified no `<style>` block in component (unless necessary)

### Example: Adding Styles for ANavbar (Navigation Component)

**Step 1:** Check if `styles/a/nav.css` exists (it doesn't)

**Step 2:** Create the file
```bash
type nul > src\styles\a\nav.css
```

**Step 3:** Add styles to the new file
```css
/* src/styles/a/nav.css */
/* Alexandria Navigation Component Styles */

@layer components {
  /* ========================================
   * ANavbar Component
   * ======================================== */
  .navbar-alexandria-main {
    @apply bg-primary-50 dark:bg-primary-1000 z-10;
    @apply border-b border-primary-200 dark:border-primary-800;
  }

  .navbar-alexandria-main svg {
    @apply fill-gray-900 hover:fill-primary-600;
    @apply dark:fill-gray-100 dark:hover:fill-primary-400;
  }

  .navbar-alexandria-main h1,
  .navbar-alexandria-main h2 {
    @apply text-gray-900 hover:text-primary-600;
    @apply dark:text-gray-100 dark:hover:text-primary-400;
  }

  /* ========================================
   * AFooter Component
   * ======================================== */
  .footer-alexandria {
    @apply bg-primary-100 dark:bg-primary-950;
    @apply border-t border-primary-200 dark:border-primary-800;
  }
}
```

**Step 4:** Import in app.css
```css
/* src/app.css */
@import "./styles/a/cards.css";
@import "./styles/a/forms.css";
@import "./styles/a/primitives.css";
@import "./styles/a/nav.css";  /* ← NEW */
```

**Step 5:** Use in component
```svelte
<!-- src/lib/a/nav/ANavbar.svelte -->
<script lang="ts">
/**
 * @fileoverview ANavbar Component - Alexandria
 * ...
 */
import { Navbar } from "flowbite-svelte";
</script>

<Navbar class="navbar-alexandria-main">
  <!-- Navbar content -->
</Navbar>
```

---

## Testing Requirements

### Component Testing
When creating or modifying components:

1. **Visual Testing**
   - Test in light and dark themes
   - Test on mobile and desktop viewports
   - Verify responsive behavior

2. **Functional Testing**
   - Test all prop combinations
   - Verify event handlers work
   - Test edge cases (empty data, long text, etc.)

3. **Accessibility Testing**
   - Keyboard navigation
   - Screen reader compatibility
   - ARIA attributes present
   - Color contrast ratios

4. **Integration Testing**
   - Test within actual application pages
   - Verify imports work correctly
   - Check for console errors

---

## Common Patterns & Best Practices

### Bindable Props
Use `$bindable` for two-way data binding:
```typescript
let {
  value = $bindable(""),
  isOpen = $bindable(false)
} = $props<{
  value?: string;
  isOpen?: boolean;
}>();
```

### Event Handlers
Use optional function props for callbacks:
```typescript
let {
  onSubmit = async () => {},
  onClick
} = $props<{
  onSubmit?: (data: string) => Promise<void>;
  onClick?: () => void;
}>();
```

### Conditional Rendering
```svelte
{#if showContent}
  <div>Content</div>
{/if}
```

### Snippets (Svelte 5)
For flexible content slots:
```typescript
@prop {snippet} children - Main content (required)
@prop {snippet} [title] - Optional title section
```

```svelte
{#snippet children()}
  Content goes here
{/snippet}
```

---

## Common Mistakes to Avoid

### DON'T: Create duplicate components
```typescript
// Bad: Creating new component without checking
export default AUserCard.svelte // AProfilePreview already exists!
```

### DO: Use existing components
```typescript
// Good: Use existing component
import { AProfilePreview } from '$lib/a';
```

### DON'T: Skip TSDoc documentation
```svelte
<!-- Bad: No documentation -->
<script>
let { prop } = $props();
</script>
```

### DO: Add complete TSDoc
```svelte
<!-- Good: Complete documentation -->
<script>
/**
 * @fileoverview AComponent - Alexandria
 * ... complete TSDoc
 */
let { prop } = $props();
</script>
```

### DON'T: Forget to update JSON
```bash
# Bad: Only editing component, not updating JSON
# (Other agents won't know about your changes!)
```

### DO: Always run the parser
```bash
# Good: Update JSON after changes
cd src/lib/a
node parse-components.js
```

### DON'T: Use generic component names
```typescript
// Bad: Could be anything
export UserDisplay.svelte
```

### DO: Follow naming convention
```typescript
// Good: Clearly part of Alexandria library
export ANostrUser.svelte
```

---

## Integration with Application

### Directory Structure
```
src/lib/a/
├── AGENTS.md                    ← This file
├── README.md                    ← User documentation
├── alexandria-components.json   ← Component registry (auto-generated)
├── index.ts                     ← Main export file
├── parse-components.js          ← JSON generator script
├── primitives/                  ← Basic UI elements
├── navigation/                  ← Nav components
├── forms/                       ← Input/form components
├── cards/                       ← Content cards
└── reader/                      ← Reader-specific components
```

### Adding Component to Library

1. **Create component** in appropriate category folder
2. **Add export** to `index.ts`:
   ```typescript
   export { default as AYourComponent } from "./category/AYourComponent.svelte";
   ```
3. **Update JSON** by running parser script
4. **Verify import** works in application

---

## Examples: Component Selection Scenarios

### Scenario 1: Displaying User Information
**Need:** Show user profile with avatar and bio

**Process:**
1. Check `alexandria-components.json` for "user" or "profile"
2. Find: `ANostrUser` (compact) and `AProfilePreview` (full card)
3. Choose based on needs:
   - Compact display in list: `ANostrUser`
   - Full profile card: `AProfilePreview`

**Solution:**
```svelte
<AProfilePreview 
  {npub} 
  showBio={true} 
  showBadges={true} 
/>
```

### Scenario 2: Creating a Comment Form
**Need:** Allow users to write and submit comments

**Process:**
1. Check `alexandria-components.json` under "Forms"
2. Find: `ACommentForm` - "Comment creation with markup support"
3. Review props: `content`, `placeholder`, `onSubmit`

**Solution:**
```svelte
<ACommentForm
  bind:content={commentText}
  placeholder="Write your comment..."
  onSubmit={handleCommentSubmit}
/>
```

### Scenario 3: Showing Event Cards
**Need:** Display nostr events in a feed

**Process:**
1. Check `alexandria-components.json` under "Cards"
2. Find: `AEventPreview` - "Event preview cards with metadata and actions"
3. Review configurable options: `showContent`, `truncateContentAt`, etc.

**Solution:**
```svelte
{#each events as event}
  <AEventPreview
    {event}
    showContent={true}
    truncateContentAt={200}
    onSelect={handleEventSelect}
  />
{/each}
```

### Scenario 4: Alert/Notification
**Need:** Show success message after save

**Process:**
1. Check "Primitives" category
2. Find: `AAlert` - "Themed alert messages with dismissal options"
3. Review color options and dismissable prop

**Solution:**
```svelte
{#if saveSuccessful}
  <AAlert color="success" dismissable={true}>
    {#snippet children()}Your changes have been saved.{/snippet}
  </AAlert>
{/if}
```

---

## Troubleshooting

### Component Not Found
1. Verify component exists in `alexandria-components.json`
2. Check import statement syntax
3. Ensure component is exported in `index.ts`
4. Check file path matches category structure

### Props Not Working
1. Check prop name spelling in `alexandria-components.json`
2. Verify prop type matches expected type
3. Check if prop is bindable (use `bind:` prefix if needed)
4. Review component TSDoc for usage examples

### Styling Issues
1. Verify theme mode (light/dark) is set correctly
2. Check if custom classes conflict with Flowbite
3. Ensure Tailwind classes are being applied
4. Test in isolation to identify conflicts

### Documentation Out of Sync
1. Run parser script: `node parse-components.js`
2. Verify TSDoc format is correct
3. Check for syntax errors in TSDoc comments
4. Manually review generated JSON

---

## Additional Resources

### Related Files
- **README.md**: User-facing library documentation
- **index.ts**: Component export definitions
- **parse-components.js**: TSDoc extraction script
- **alexandria-components.json**: Generated component registry

### External Documentation
- [Flowbite Svelte](https://flowbite-svelte.com/) - Base component library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework
- [TSDoc](https://tsdoc.org/) - Documentation standard
- [Svelte 5 Docs](https://svelte.dev/docs) - Svelte framework

### Nostr-Specific
- [NDK Documentation](https://github.com/nostr-dev-kit/ndk) - Nostr Development Kit
- [NIPs](https://github.com/nostr-protocol/nips) - Nostr Implementation Possibilities

---

## Quick Checklist for AI Agents

Before creating or modifying any UI component:

- [ ] Searched `alexandria-components.json` for existing components
- [ ] Reviewed component props and examples
- [ ] Verified no existing component meets the need
- [ ] Chosen appropriate category for new component
- [ ] Named component with `A` prefix (e.g., `AComponentName`)
- [ ] Added complete TSDoc documentation
- [ ] Followed TSDoc format exactly as documented
- [ ] Included all required tags (@fileoverview, @component, @category, @prop, @example, @features, @accessibility)
- [ ] Added component export to `index.ts`
- [ ] Ran `node parse-components.js` to update JSON
- [ ] Tested component in light and dark themes
- [ ] Verified accessibility compliance
- [ ] Checked for TypeScript/linting errors

---

## Summary

1. **Always search first** - Check `alexandria-components.json` before creating anything
2. **Use TSDoc religiously** - Every component must have complete TSDoc documentation
3. **Update the JSON** - Run parser script after any component changes
4. **Follow naming conventions** - `A` prefix, PascalCase, descriptive names
5. **Maintain consistency** - Match existing patterns and style
7. **Don't reinvent** - Reuse existing components whenever possible

**Remember:** The goal is to maintain a cohesive, well-documented, and easily discoverable 
component library that serves the entire Alexandria application ecosystem.

---

**Questions or Issues?**  
Refer to this guide, review existing components for patterns, or check the main README.md for additional context.
