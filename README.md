![Roman scrolls](https://i.nostr.build/M5qXa.jpg) 

# Alexandria

Alexandria is a Nostr Knowledge Base (NKB) and a reader for long-form articles.
For a thorough introduction, please refer to our [project documention](https://wikistr.com/gc-alexandria*dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319).
 
## Features 
 
### Elegant Design 
 
As Alexandria is targeted toward those who are trying to focus on longer, more-complex content, the design has been stripped down of any distracting elements or unnecessary details, so that the user can concentrate on the valuable information stored in the documents that they are viewing. Both light-mode and dark-mode are available. 
 
![Menu](https://i.nostr.build/4oAlm.png) 
 
![event display](https://i.nostr.build/KG2D2.png) 
 
![cards](https://i.nostr.build/Vwkl0.png) 
 
### Modular articles 
 
The specialty of this client is the ability to display long-form articles, particularly of the modular variety: event kinds [30040 and 30041](https://wikistr.com/nkbip-01). It will eventually also able to display wiki pages (event kind [30818](https://wikistr.com/nip-54)) and normal long-form articles (event kind [30023](https://wikistr.com/nip-23)). 
 
Modular articles are often referred to as the *Nostr eBook format*, with 30040 events containing the metadata and the ordered list of the 30041 notes, which contain the formatted content. The 30040 index is used to create a sidebar containing the table of contents, and the 30041 sections can be individually selected and interacted with.
![Alexandria reading page](https://i.nostr.build/KEReOZ0LH6w9jrM8.png)
 
### Write articles 
 
Alexandria features an Asciidoc upload facility, for you to transform your well-formatted text to Nostr events and publish them to your preferred relays. The GitCitadel relay is set as the default, to ensure that you have at least one relay that is sure to work. 
 
For an interim solution, please use the [command line program.](https://gitworkshop.dev/r/naddr1qqxx2sn0da442arfd35hg7gpz4mhxue69uhhqatjwpkx2un9d3shjtnrdaksyg8ayz8w3j8jsduq492j39hysg7vnhrtl4zzqcugj4m3q62qlkf8cypsgqqqw7vs555whg/)

## Developing

Make sure that you have [Node.js](https://nodejs.org/en/download/package-manager) installed.

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`) -- make sure to use an independent shell for this step, and not a terminal embedded in an IDE --, start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.

## Docker

To run docker type:
```bash
docker build . -t gc-alexandria
docker run --rm --name=gc-alexandria -p 4174:80 gc-alexandria

```
Notes: 
Dockerized Alexandria starts at port 4174 instead of 4173 in the example. Change the port if you like it.
<br>Internet page used as guide: https://www.sveltesociety.dev/recipes/publishing-and-deploying/dockerize-a-svelte-app

## Testing

To run the Vitest suite we've built, install the program locally and run the tests.

```bash
npm run test
```

For the Playwright end-to-end (e2e) tests:

```bash
npx playwright test
```