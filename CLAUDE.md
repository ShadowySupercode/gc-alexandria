# Alexandria Codebase - Local Instructions

This document provides project-specific instructions for working with the Alexandria codebase, based on existing Cursor rules and project conventions.

## Developer Context

You are working with a senior developer who has 20 years of web development experience, 8 years with Svelte, and 4 years developing production Nostr applications. Assume high technical proficiency.

## Project Overview

Alexandria is a Nostr-based web application for reading, commenting on, and publishing long-form content (books, blogs, etc.) stored on Nostr relays. Built with:

- **Svelte 5** and **SvelteKit 2** (latest versions)
- **TypeScript** (exclusively, no plain JavaScript)
- **Tailwind 4** for styling
- **Deno** runtime (with Node.js compatibility)
- **NDK** (Nostr Development Kit) for protocol interaction

## Architecture Pattern

The project follows a Model-View-Controller (MVC) pattern:

- **Model**: Nostr relays (via WebSocket APIs) and browser storage
- **View**: Reactive UI with SvelteKit pages and Svelte components
- **Controller**: TypeScript modules with utilities, services, and data preparation

## Critical Development Guidelines

### Prime Directive

**NEVER assume developer intent.** If unsure, ALWAYS ask for clarification before proceeding.

### AI Anchor Comments System

Before any work, search for `AI-` anchor comments in relevant directories:

- `AI-NOTE:`, `AI-TODO:`, `AI-QUESTION:` - Context sharing between AI and developers
- `AI-<MM/DD/YYYY>:` - Developer-recorded context (read but don't write)
- **Always update relevant anchor comments when modifying code**
- Add new anchors for complex, critical, or confusing code
- Never remove AI comments without explicit instruction

### Communication Style

- Be direct and concise - avoid apologies or verbose explanations
- Include file names and line numbers (e.g., `src/lib/utils/parser.ts:45-52`)
- Provide documentation links for further reading
- When corrected, provide well-reasoned explanations, not simple agreement
- Don't propose code edits unless specifically requested

## Code Style Requirements

### TypeScript Files (\*.ts)

- **File naming**: `snake_case.ts`
- **Classes/Interfaces/Types**: `PascalCase`
- **Functions/Variables**: `camelCase`
- **Private class members**: `#privateField` (ES2022 syntax)
- **Indentation**: 2 spaces
- **Line length**: 100 characters max
- **Strings**: Single quotes default, backticks for templates
- **Always include**:
  - Type annotations for class properties
  - Parameter types and return types (except void)
  - JSDoc comments for exported functions
  - Semicolons at statement ends

### Svelte Components (\*.svelte)

- **Component naming**: `PascalCase.svelte`
- **Use Svelte 5 features exclusively**:
  - Runes: `$state`, `$derived`, `$effect`, `$props`
  - Callback props (not event dispatchers)
  - Snippets (not slots)
- **Avoid deprecated Svelte 4 patterns**:
  - No `export let` for props
  - No `on:` event directives
  - No event dispatchers or component slots
- **Component organization** (in order):
  1. Imports
  2. Props definition (strongly typed)
  3. Context imports (`getContext`)
  4. State declarations (`$state`, then `$derived`)
  5. Non-reactive variables
  6. Component logic (functions, `$effect`)
  7. Lifecycle hooks (`onMount`)
  8. Snippets (before markup)
  9. Component markup
  10. Style blocks (rare - prefer Tailwind)
- **Keep components under 500 lines**
- **Extract business logic to separate TypeScript modules**

### HTML/Markup

- Indentation: 2 spaces
- Break long tags across lines
- Use Tailwind 4 utility classes
- Single quotes for attributes

## Key Project Utilities

### Core Classes to Use

- `WebSocketPool` (`src/lib/data_structures/websocket_pool.ts`) - For WebSocket management
- `PublicationTree` - For hierarchical publication structure
- `ZettelParser` - For AsciiDoc parsing

### Nostr Event Kinds

- `30040` - Blog/publication indexes
- `30041` - Publication sections/articles
- `30023` - Long-form articles
- `30818` - Wiki Notes
- `1` - Short notes

## Development Commands

```bash
# Development
npm run dev              # Start dev server
npm run dev:debug        # With relay debugging (DEBUG_RELAYS=true)

# Quality Checks (run before commits)
npm run check           # Type checking
npm run lint            # Linting
npm run format          # Auto-format
npm test                # Run tests

# Build
npm run build           # Production build
npm run preview         # Preview production
```

## Testing Requirements

- Unit tests: Vitest with mocked dependencies
- E2E tests: Playwright for critical flows
- Always run `npm test` before commits
- Check types with `npm run check`

## Git Workflow

- Current branch: `feature/text-entry`
- Main branch: `master` (not `main`)
- Descriptive commit messages
- Include test updates with features

## Important Files

- `src/lib/ndk.ts` - NDK configuration
- `src/lib/utils/ZettelParser.ts` - AsciiDoc parsing
- `src/lib/services/publisher.ts` - Event publishing
- `src/lib/components/ZettelEditor.svelte` - Main editor
- `src/routes/new/compose/+page.svelte` - Composition UI

## Performance Considerations

- State is deeply reactive in Svelte 5 - avoid unnecessary reassignments
- Lazy load large components
- Use virtual scrolling for long lists
- Cache Nostr events with Dexie
- Minimize relay subscriptions
- Debounce search inputs

## Security Notes

- Never store private keys in code
- Validate all user input
- Sanitize external HTML
- Verify event signatures

## Debugging

- Enable relay debug: `DEBUG_RELAYS=true npm run dev`
- Check browser console for NDK logs
- Network tab shows WebSocket frames

## Documentation Links

- [Nostr NIPs](https://github.com/nostr-protocol/nips)
- [NDK Docs](https://github.com/nostr-dev-kit/ndk)
- [SvelteKit Docs](https://kit.svelte.dev/docs)
- [Svelte 5 Docs](https://svelte.dev/docs/svelte/overview)
- [Flowbite Svelte](https://flowbite-svelte.com/)
