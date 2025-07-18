import { ndkInstance } from "$lib/ndk";
import { signEvent, getEventHash } from "$lib/utils/nostrUtils";
import { getMimeTags } from "$lib/utils/mime";
import { communityRelays } from "$lib/consts";
import { nip19 } from "nostr-tools";

export interface ZettelSection {
  title: string;
  content: string;
  tags?: string[][];
}

/**
 * Splits AsciiDoc content into sections at the specified heading level.
 * Each section starts with the heading and includes all lines up to the next heading of the same level.
 * @param content The AsciiDoc string.
 * @param level The heading level (2 for '==', 3 for '===', etc.).
 * @returns Array of section strings, each starting with the heading.
 */
export function splitAsciiDocByHeadingLevel(
  content: string,
  level: number,
): string[] {
  if (level < 1 || level > 6) throw new Error("Heading level must be 1-6");
  const heading = "^" + "=".repeat(level) + " ";
  const regex = new RegExp(`(?=${heading})`, "gm");
  return content
    .split(regex)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);
}

/**
 * Parses a single AsciiDoc section string into a ZettelSection object.
 * @param section The section string (must start with heading).
 */
export function parseZettelSection(section: string): ZettelSection {
  const lines = section.split("\n");
  let title = "Untitled";
  let contentLines: string[] = [];
  let inHeader = true;
  let tags: string[][] = [];
  tags = extractTags(section);

  for (const line of lines) {
    const trimmed = line.trim();
    if (inHeader && trimmed.startsWith("==")) {
      title = trimmed.replace(/^==+/, "").trim();
      continue;
    } else if (inHeader && trimmed.startsWith(":")) {
      continue;
    }

    inHeader = false;
    contentLines.push(line);
  }

  return {
    title,
    content: contentLines.join("\n").trim(),
    tags,
  };
}

/**
 * Parses AsciiDoc into an array of ZettelSection objects at the given heading level.
 */
export function parseAsciiDocSections(
  content: string,
  level: number,
): ZettelSection[] {
  return splitAsciiDocByHeadingLevel(content, level).map(parseZettelSection);
}

/**
 * Extracts tag names and values from the content.
 * :tagname: tagvalue // tags are optional
 * @param content The AsciiDoc string.
 * @returns Array of tags.
 */
export function extractTags(content: string): string[][] {
  const tags: string[][] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(":")) {
      // Parse AsciiDoc attribute format: :tagname: value
      const match = trimmed.match(/^:([^:]+):\s*(.*)$/);
      if (match) {
        const tagName = match[1].trim();
        const tagValue = match[2].trim();

        // Special handling for tags attribute
        if (tagName === "tags") {
          // Split comma-separated values and create individual "t" tags
          const tagValues = tagValue
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
          for (const value of tagValues) {
            tags.push(["t", value]);
          }
        } else {
          // Regular attribute becomes a tag
          tags.push([tagName, tagValue]);
        }
      }
    }
  }

  console.log("Extracted tags:", tags);
  return tags;
}
// You can add publishing logic here as needed, e.g.,
// export async function publishZettelSection(...) { ... }
