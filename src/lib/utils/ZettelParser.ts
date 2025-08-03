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
  const contentLines: string[] = [];
  let tags: string[][] = [];
  tags = extractTags(section);

  // Find the section title first
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("==")) {
      title = trimmed.replace(/^==+/, "").trim();
      
      // Process header metadata (everything after title until blank line)
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "") {
        const headerLine = lines[j].trim();
        if (headerLine.startsWith(":")) {
          // This is metadata, already handled by extractTags
          j++;
        } else {
          // This is header content (like author name), skip from content
          j++;
        }
      }
      
      // Skip the blank line
      if (j < lines.length && lines[j].trim() === "") {
        j++;
      }
      
      // Everything after the blank line is content
      for (let k = j; k < lines.length; k++) {
        contentLines.push(lines[k]);
      }
      break;
    }
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
 * Also handles AsciiDoc author line convention
 * @param content The AsciiDoc string.
 * @returns Array of tags.
 */
export function extractTags(content: string): string[][] {
  const tags: string[][] = [];
  const lines = content.split("\n");

  // Find the section title and process header metadata
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.startsWith("==")) {
      // Process header metadata (everything after title until blank line)
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "") {
        const headerLine = lines[j].trim();
        
        if (headerLine.startsWith(":")) {
          // Parse AsciiDoc attribute format: :tagname: value
          const match = headerLine.match(/^:([^:]+):\s*(.*)$/);
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
        } else {
          // This is header content (like author name)
          tags.push(["author", headerLine]);
        }
        j++;
      }
      break;
    }
  }

  console.log("Extracted tags:", tags);
  return tags;
}
// You can add publishing logic here as needed, e.g.,
// export async function publishZettelSection(...) { ... }
