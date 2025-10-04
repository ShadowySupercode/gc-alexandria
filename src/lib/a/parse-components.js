#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} PropDefinition
 * @property {string} name
 * @property {string[]} type
 * @property {string | null | undefined} default
 * @property {string} description
 * @property {boolean} required
 */

/**
 * @typedef {Object} ExampleDefinition
 * @property {string} name
 * @property {string} code
 */

/**
 * @typedef {Object} ComponentDefinition
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {PropDefinition[]} props
 * @property {string[]} events
 * @property {string[]} slots
 * @property {ExampleDefinition[]} examples
 * @property {string[]} features
 * @property {string[]} accessibility
 * @property {string} since
 */

/**
 * Parse TSDoc comments from Svelte component files
 */
class ComponentParser {
  constructor() {
    /** @type {ComponentDefinition[]} */
    this.components = [];
  }

  /**
   * Extract TSDoc block from script content
   * @param {string} content
   * @returns {string | null}
   */
  extractTSDoc(content) {
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return null;

    const scriptContent = scriptMatch[1];
    const tsDocMatch = scriptContent.match(/\/\*\*\s*([\s\S]*?)\*\//);
    if (!tsDocMatch) return null;

    return tsDocMatch[1];
  }

  /**
   * Parse TSDoc content into structured data
   * @param {string} tsDocContent
   * @returns {ComponentDefinition}
   */
  parseTSDoc(tsDocContent) {
    const lines = tsDocContent
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim());

    /** @type {ComponentDefinition} */
    const component = {
      name: "",
      description: "",
      category: "",
      props: [],
      events: [],
      slots: [],
      examples: [],
      features: [],
      accessibility: [],
      since: "1.0.0", // Default version
    };

    let currentSection = "description";
    let currentExample = "";
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (!line) continue;

      // Handle @tags
      if (line.startsWith("@fileoverview")) {
        const nameMatch = line.match(/@fileoverview\s+(\w+)\s+Component/);
        if (nameMatch) {
          component.name = nameMatch[1];
        }
        const descMatch = lines
          .slice(i + 1)
          .find((l) => l && !l.startsWith("@"))
          ?.trim();
        if (descMatch) {
          component.description = descMatch;
        }
        continue;
      }

      if (line.startsWith("@category")) {
        component.category = line.replace("@category", "").trim();
        continue;
      }

      if (line.startsWith("@prop")) {
        const prop = this.parseProp(line);
        if (prop) component.props.push(prop);
        continue;
      }

      if (line.startsWith("@example")) {
        currentSection = "example";
        currentExample = line.replace("@example", "").trim();
        if (currentExample) {
          currentExample += "\n";
        }
        continue;
      }

      if (line.startsWith("@features")) {
        currentSection = "features";
        continue;
      }

      if (line.startsWith("@accessibility")) {
        currentSection = "accessibility";
        continue;
      }

      if (line.startsWith("@since")) {
        component.since = line.replace("@since", "").trim();
        continue;
      }

      // Handle content based on current section
      if (currentSection === "example") {
        if (line === "```svelte" || line === "```") {
          inCodeBlock = !inCodeBlock;
          if (!inCodeBlock && currentExample.trim()) {
            component.examples.push({
              name: currentExample.split("\n")[0] || "Example",
              code: currentExample.trim(),
            });
            currentExample = "";
          }
          continue;
        }
        if (inCodeBlock) {
          currentExample += line + "\n";
        } else if (line.startsWith("@")) {
          // New section started
          i--; // Reprocess this line
          currentSection = "description";
        } else if (line && !line.startsWith("```")) {
          currentExample = line + "\n";
        }
        continue;
      }

      if (currentSection === "features" && line.startsWith("-")) {
        component.features.push(line.substring(1).trim());
        continue;
      }

      if (currentSection === "accessibility" && line.startsWith("-")) {
        component.accessibility.push(line.substring(1).trim());
      }
    }

    return component;
  }

  /**
   * Parse a @prop line into structured prop data
   * @param {string} propLine
   * @returns {PropDefinition | null}
   */
  parseProp(propLine) {
    // First, extract the type by finding balanced braces
    const propMatch = propLine.match(/@prop\s+\{/);
    if (!propMatch || propMatch.index === undefined) return null;

    // Find the closing brace for the type
    let braceCount = 1;
    let typeEndIndex = propMatch.index + propMatch[0].length;
    const lineAfterType = propLine.substring(typeEndIndex);

    for (let i = 0; i < lineAfterType.length; i++) {
      if (lineAfterType[i] === "{") braceCount++;
      if (lineAfterType[i] === "}") braceCount--;
      if (braceCount === 0) {
        typeEndIndex += i;
        break;
      }
    }

    const typeStr = propLine
      .substring(propMatch.index + propMatch[0].length, typeEndIndex)
      .trim();
    const restOfLine = propLine.substring(typeEndIndex + 1).trim();

    // Parse the rest: [name=default] or name - description
    const restMatch = restOfLine.match(
      /(\[?)([^[\]\s=-]+)(?:=([^\]]*))?]?\s*-?\s*(.*)/,
    );

    if (!restMatch) return null;

    const [, isOptional, name, defaultValue, description] = restMatch;

    // Parse type - handle union types like "xs" | "s" | "m" | "l"
    let type = [typeStr.trim()];
    if (typeStr.includes("|") && !typeStr.includes("<")) {
      type = typeStr.split("|").map((t) => t.trim().replace(/"/g, ""));
    } else if (typeStr.includes('"') && !typeStr.includes("<")) {
      // Handle quoted literal types
      const literals = typeStr.match(/"[^"]+"/g);
      if (literals) {
        type = literals.map((l) => l.replace(/"/g, ""));
      }
    }

    return {
      name: name.trim(),
      type: type,
      default: defaultValue
        ? defaultValue.trim()
        : isOptional
          ? undefined
          : null,
      description: description.trim(),
      required: !isOptional,
    };
  }

  /**
   * Process a single Svelte file
   * @param {string} filePath
   * @returns {ComponentDefinition | null}
   */
  processFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const tsDocContent = this.extractTSDoc(content);

      if (!tsDocContent) {
        console.warn(`No TSDoc found in ${filePath}`);
        return null;
      }

      const component = this.parseTSDoc(tsDocContent);

      // If no name was extracted, use filename
      if (!component.name) {
        component.name = path.basename(filePath, ".svelte");
      }

      return component;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${filePath}:`, errorMessage);
      return null;
    }
  }

  /**
   * Process all Svelte files in a directory recursively
   * @param {string} dirPath
   */
  processDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        this.processDirectory(itemPath);
      } else if (item.endsWith(".svelte")) {
        const component = this.processFile(itemPath);
        if (component) {
          this.components.push(component);
        }
      }
    }
  }

  /**
   * Generate the final JSON output
   */
  generateOutput() {
    // Sort components by category and name
    this.components.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    return {
      library: "Alexandria Component Library",
      version: "1.0.0",
      generated: new Date().toISOString(),
      totalComponents: this.components.length,
      categories: [...new Set(this.components.map((c) => c.category))].sort(),
      components: this.components,
    };
  }
}

/**
 * Main execution
 */
function main() {
  const parser = new ComponentParser();
  const aFolderPath = __dirname;

  console.log('Parsing Alexandria components...');
  console.log(`Source directory: ${aFolderPath}`);

  if (!fs.existsSync(aFolderPath)) {
    console.error(`Directory not found: ${aFolderPath}`);
    process.exit(1);
  }

  // Process all components
  parser.processDirectory(aFolderPath);

  // Generate output
  const output = parser.generateOutput();

  // Write to file in the same directory (/a folder)
  const outputPath = path.join(__dirname, 'alexandria-components.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Successfully parsed ${output.totalComponents} components`);
  console.log(`📁 Categories: ${output.categories.join(', ')}`);
  console.log(`💾 Output saved to: ${outputPath}`);

  // Print summary
  console.log('\n📊 Component Summary:');
  /** @type {Record<string, number>} */
  const categoryCounts = {};
  output.components.forEach(c => {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  });

  Object.entries(categoryCounts).forEach(([category, count]) => {
    console.log(`  ${category}: ${count} components`);
  });
}

// Run the script
main();
