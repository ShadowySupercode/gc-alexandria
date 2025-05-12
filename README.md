![Roman scrolls](https://i.nostr.build/M5qXa.jpg) 

# Alexandria

Alexandria is a reader and writer for curated publications, including e-books.
For a thorough introduction, please refer to our [project documention](https://next-alexandria.gitcitadel.eu/publication?d=gitcitadel-project-documentation-by-stella-v-1), viewable on Alexandria, or to the Alexandria [About page](https://next-alexandria.gitcitadel.eu/about).

## Issues and Patches

If you would like to suggest a feature or report a bug, or submit a patch for review, please use the [Nostr git interface](https://gitcitadel.com/r/naddr1qvzqqqrhnypzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqyt8wumn8ghj7ur4wfcxcetjv4kxz7fwvdhk6tcqpfqkcetcv9hxgunfvyamcf5z) on our homepage.

You can also contact us [on Nostr](https://njump.me/nprofile1qqsggm4l0xs23qfjwnkfwf6fqcs66s3lz637gaxhl4nwd2vtle8rnfqprfmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdaks5zhueg), directly.

## Developing

Make sure that you have [Node.js](https://nodejs.org/en/download/package-manager) (v22 or above) or [Deno](https://docs.deno.com/runtime/getting_started/installation/) (v2) installed.

Once you've cloned this repo, install dependencies with NPM:
```bash
npm install
```

or with Deno:
```bash
deno install
```

then start a development server with Node:
```bash
npm run dev
```

or with Deno:
```bash
deno task dev
```

## Building

Alexandria is configured to run on a Node server.  The [Node adapter](https://svelte.dev/docs/kit/adapter-node) works on Deno as well.

To build a production version of your app with Node, use:
```bash
npm run build
```

or with Deno:
```bash
deno task build
```

You can preview the (non-static) production build with:
```bash
npm run preview
```

or with Deno:
```bash
deno task preview
```

## Docker

This docker container performs the build.

To build the container:
```bash
docker build . -t gc-alexandria
```

To run the container, in detached mode (-d):
```bash
docker run -d --rm --name=gc-alexandria -p 4174:80 gc-alexandria
```

The container is then viewable on your [local machine](http://localhost:4174).

If you want to see the container process (assuming it's the last process to start), enter:

```bash
docker ps -l
```

which should return something like: 

```bash
CONTAINER ID   IMAGE           COMMAND                  CREATED         STATUS         PORTS                                     NAMES
1d83d736322f   gc-alexandria   "/docker-entrypoint.…"   2 minutes ago   Up 2 minutes   0.0.0.0:4174->80/tcp, [::]:4174->80/tcp   gc-alexandria
```

## Docker + Deno

This application is configured to use the Deno runtime.  A Docker container is provided to handle builds and deployments.

To build the app for local development:
```bash
docker build -t local-alexandria -f Dockerfile.local .
```

To run the local development build:
```bash
docker run -d -p 3000:3000 local-alexandria
```

## Testing

*These tests are under development, but will run. They will later be added to the container.*

To run the Vitest suite we've built, install the program locally and run the tests.
```bash
npm run test
```

For the Playwright end-to-end (e2e) tests:
```bash
npx playwright test
```

## Markdown Support

In addition to the [standard Asciidoc](https://asciidoc.org/) support for publication and wiki events, Alexandria supports a rich set of Markdown features for content creation:

### Text Formatting
- **Bold**: `*text*` or `**text**`
- **Italic**: `_text_` or `__text__`
- **Strikethrough**: `~text~` or `~~text~~`
- **Inline Code**: `` `code` ``
- **Links**: `[text](url)`
- **Images**: `![alt](url)`

### Structure
- **Headings**: 
  - ATX style: `# Heading 1` through `###### Heading 6`
  - Setext style: 
    ```markdown
    Heading 1
    ========
    ```
- **Lists**:
  - Unordered: `* item`
  - Ordered: `1. item`, `2. item`
  - Nested lists supported
- **Code Blocks with language-specific highlighting**:
  ```markdown
      ```javascript
      const code = 'example';
      ```
  ```
- **Blockquotes**: `> Quote text`
- **Horizontal Rules**: `---`
- **Tables**:
  ```markdown
  | Header 1 | Header 2 |
  |----------|----------|
  | Cell 1   | Cell 2   |
  ```

### Special Features
- **Footnotes**: `[^1]` and `[^1]: definition`
- **Emojis**: `:smile:`
- **Hashtags**: `#tag`
- **Nostr Identifiers**: 
  - Profiles: `npub...` or `nprofile...`
  - Notes: `note...`, `nevent...`, or `naddr...`

### Media Support
- **YouTube Videos**: Automatically embedded
- **Video Files**: mp4, webm, mov, avi
- **Audio Files**: mp3, wav, ogg, m4a
- **Images**: jpg, jpeg, gif, png, webp

All media URLs are automatically cleaned of tracking parameters for privacy.