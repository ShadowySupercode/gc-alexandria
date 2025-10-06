import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { execSync } from "child_process";
import process from "node:process";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import deno from "@deno/vite-plugin";

// Function to get the latest git tag
function getAppVersionString() {
  // if running in ci context, we can assume the package has been properly versioned
  if (
    process.env.ALEXANDIRA_IS_CI_BUILD &&
    process.env.npm_package_version &&
    process.env.npm_package_version.trim() !== ""
  ) {
    return process.env.npm_package_version;
  }

  try {
    // Get the latest git tag, assuming git is installed and tagged branch is available
    const tag = execSync("git describe --tags --abbrev=0").toString().trim();
    return tag;
  } catch {
    return "development";
  }
}

export default defineConfig({
  plugins: [deno(), wasm(), topLevelAwait(), sveltekit()],
  resolve: {
    alias: {
      $lib: "./src/lib",
      $components: "./src/components",
    },
  },
  assetsInclude: ["**/*.wasm"],
  test: {
    include: ["./tests/unit/**/*.test.ts", "./tests/integration/**/*.test.ts"],
  },
  define: {
    // Expose the app version as a global variable
    "import.meta.env.APP_VERSION": JSON.stringify(getAppVersionString()),
    // Enable debug logging for relays when needed
    "process.env.DEBUG_RELAYS": JSON.stringify(
      process.env.DEBUG_RELAYS || "false",
    ),
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2024",
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
    hmr: {
      overlay: false, // Disable HMR overlay to prevent ESM URL scheme errors
    },
  },
});
