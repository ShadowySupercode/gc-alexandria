import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { execSync } from "child_process";
import process from "node:process";

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
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $lib: "./src/lib",
      $components: "./src/components",
    },
  },
  build: {
    rollupOptions: {
      external: ["bech32"],
    },
  },
  test: {
    include: ["./tests/unit/**/*.test.ts", "./tests/integration/**/*.test.ts"],
  },
  define: {
    // Expose the app version as a global variable
    "import.meta.env.APP_VERSION": JSON.stringify(getAppVersionString()),
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
