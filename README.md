![Roman scrolls](https://i.nostr.build/M5qXa.jpg) 

# Alexandria

Alexandria is a reader and writer for curated publications.
For a thorough introduction, please refer to our [project documention](https://next-alexandria.gitcitadel.eu/publication?d=gitcitadel-project-documentation-by-stella-v-1), viewable on Alexandria.

## Issues and Patches

If you would like to suggest a feature or report a bug, or submit a patch for review, please use the [Nostr git interface](https://gitcitadel.com/r/naddr1qvzqqqrhnypzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqyt8wumn8ghj7ur4wfcxcetjv4kxz7fwvdhk6tcqpfqkcetcv9hxgunfvyamcf5z) on our homepage.

## Developing

Make sure that you have [Node.js](https://nodejs.org/en/download/package-manager) installed.

Once you've cloned this repo, install dependencies with:

```bash
npm install
```

then start a development server:
```bash
npm run dev
```

or start the server and open the app in a new browser tab:
```bash
npm run dev -- --open
```

## Building

To build a production version of your app, as a static site:
```bash
npm run build
```

You can preview the production build with:
```bash
npm run preview
```

> We have configured Alexandria to use the static adapter. To deploy your app with a different adapter, you will need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.

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