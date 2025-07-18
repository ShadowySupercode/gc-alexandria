![Roman scrolls](https://i.nostr.build/M5qXa.jpg)

# Alexandria

Alexandria is a reader and writer for curated publications, including e-books.
For a thorough introduction, please refer to our [project documention](https://next-alexandria.gitcitadel.eu/publication?d=gitcitadel-project-documentation-by-stella-v-1), viewable on Alexandria, or to the Alexandria [About page](https://next-alexandria.gitcitadel.eu/about).

It also contains a [universal event viewer](https://next-alexandria.gitcitadel.eu/events), with which you can search our relays, some aggregator relays, and your own relay list, to find and view event data.

## Issues and Patches

If you would like to suggest a feature or report a bug, please use the [Alexandria Contact page](https://next-alexandria.gitcitadel.eu/contact).

You can also contact us [on Nostr](https://next-alexandria.gitcitadel.eu/events?id=nprofile1qqsggm4l0xs23qfjwnkfwf6fqcs66s3lz637gaxhl4nwd2vtle8rnfqprfmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdaks5zhueg), directly.

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

Alexandria is configured to run on a Node server. The [Node adapter](https://svelte.dev/docs/kit/adapter-node) works on Deno as well.

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

## Docker + Deno

This application is configured to use the Deno runtime. A Docker container is provided to handle builds and deployments.

To build the app for local development:

```bash
docker build -t local-alexandria -f Dockerfile .
```

To run the local development build:

```bash
docker run -d -p 3000:3000 local-alexandria
```

## Testing

_These tests are under development, but will run. They will later be added to the container._

To run the Vitest suite we've built, install the program locally and run the tests.

```bash
npm run test
```

For the Playwright end-to-end (e2e) tests:

```bash
npx playwright test
```

## Markup Support

Alexandria supports both Markdown and AsciiDoc markup for different content types. For a detailed list of supported tags and features in the basic and advanced markdown parsers, as well as information about AsciiDoc usage for publications and wikis, see [MarkupInfo.md](./src/lib/utils/markup/MarkupInfo.md).
