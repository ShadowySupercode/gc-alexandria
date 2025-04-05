import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { execSync } from "child_process";

// Function to get the latest git tag
function getLatestGitTag() {
  try {
    // Get the latest git tag
    const tag = execSync('git describe --tags --abbrev=0').toString().trim();
    return tag;
  } catch (error) {
    console.error("Failed to get git tag:", error);
    return "unknown";
  }
}

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['./tests/unit/**/*.unit-test.js']
  },
  define: {
    // Expose the git tag as a global variable
    'import.meta.env.GIT_TAG': JSON.stringify(getLatestGitTag())
  }
});
