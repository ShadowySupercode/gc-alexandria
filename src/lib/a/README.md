# Alexandria Component Library

A comprehensive, project-scoped component library for the Alexandria nostr application. All components are built on Flowbite Svelte and Tailwind CSS, providing consistent theming and accessibility across the application.

> **For AI Agents & Detailed Guidelines:** See [AGENTS.md](./AGENTS.md) for complete workflow instructions, styling architecture, and component creation guidelines.

## Quick Start

```typescript
// Import components from the library
import { AAlert, AEventPreview, AMarkupForm } from '$lib/a';

// Use in your Svelte components
<AAlert color="success" dismissable={true}>
  {#snippet children()}Your changes have been saved!{/snippet}
</AAlert>
```

## Component Categories

### 🧱 Primitives (8)
Basic building blocks: `AAlert`, `ADetails`, `AInput`, `ANostrBadge`, `ANostrBadgeRow`, `ANostrUser`, `APagination`, `AThemeToggleMini`

### 🧭 Navigation (2)
App navigation: `ANavbar`, `AFooter`

### 📝 Forms (4)
Input interfaces: `ACommentForm`, `AMarkupForm`, `ASearchForm`, `ATextareaWithPreview`

### 🃏 Cards (2)
Content display: `AEventPreview`, `AProfilePreview`

### 👁️ Reader (2)
Technical content controls: `ATechBlock`, `ATechToggle`

## Component Reference

All components are documented in `alexandria-components.json`. This file contains:
- Complete prop definitions with types and defaults
- Usage examples and patterns
- Features and accessibility information

**View component details:**
```bash
# Generate/update the component reference
cd src/lib/a
node parse-components.js
```

## Usage Examples

### Display a user profile
```svelte
<ANostrUser 
  {npub} 
  {profile} 
  size="lg" 
  showBadges={true}
  href="/profile/{npub}"
/>
```

### Show an event card
```svelte
<AEventPreview 
  {event} 
  label="Article"
  showContent={true}
  actions={[{label: "View", onClick: handleView}]}
/>
```

### Rich text editor with preview
```svelte
<ATextareaWithPreview 
  bind:value={content}
  parser={parseMarkup}
  previewSnippet={markupRenderer}
  placeholder="Write your content..."
/>
```

### Alert notification
```svelte
{#if saveSuccessful}
  <AAlert color="success" dismissable={true}>
    {#snippet children()}Your changes have been saved.{/snippet}
  </AAlert>
{/if}
```

## Key Features

- ✅ **Consistent theming** - Automatic light/dark mode support
- ✅ **Accessibility first** - ARIA attributes, keyboard navigation, screen reader friendly
- ✅ **TypeScript support** - Full type definitions for all props
- ✅ **TSDoc documented** - Machine-readable documentation for AI tools
- ✅ **Flexible APIs** - Sensible defaults with extensive customization options

## Documentation

All components follow TSDoc format with these tags:
- `@fileoverview` - Component description
- `@category` - Component category
- `@prop` - Property definitions with types
- `@example` - Usage examples
- `@features` - Key functionality
- `@accessibility` - Accessibility notes

The `parse-components.js` script extracts this documentation into `alexandria-components.json` for automated tooling and AI agents.

## Contributing

When adding components:
1. Follow the `A[ComponentName]` naming convention
2. Add complete TSDoc documentation
3. Place in the appropriate category folder
4. Export from `index.ts`
5. Run `node parse-components.js` to update the JSON reference

**See [AGENTS.md](./AGENTS.md) for detailed guidelines on:**
- Component creation workflow
- Styling architecture (mandatory `/src/styles/a/` folder structure)
- TSDoc documentation standards
- Testing requirements
- Common patterns and best practices

## Resources

- [Flowbite Svelte](https://flowbite-svelte.com/) - Base component library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework
- [TSDoc](https://tsdoc.org/) - Documentation standard
- [Svelte 5](https://svelte.dev/docs) - Framework documentation
