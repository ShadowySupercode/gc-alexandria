import adapter from "svelte-adapter-bun";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [vitePreprocess()],

  kit: {
    // Static adapter
    adapter: adapter({
      out: "build",
      assets: true,
      envPrefix: "ALEX_",
      development: false,
      precompress: false,
    }),
    alias: {
      $lib: "src/lib",
      $components: "src/lib/components",
      $cards: "src/lib/cards",
    },
  },
};

export default config;
