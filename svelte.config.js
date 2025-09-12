import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [vitePreprocess()],

  kit: {
    // Deno adapter
    adapter: adapter(),
    alias: {
      $lib: "src/lib",
      $components: "src/lib/components",
      $cards: "src/lib/cards",
      $relay_selector: "lib/relay_selector/pkg/bundler",
    },
  },
};

export default config;
