import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $lib: './src/lib',
      $components: './src/components'
    }
  },
  test: {
    include: ['./tests/unit/**/*.unit-test.js']
  }
});
