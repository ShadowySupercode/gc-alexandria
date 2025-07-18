/**
 * Generate a dark-pastel color based on a string (like an event ID)
 * @param seed - The string to generate a color from
 * @returns A dark-pastel hex color
 */
export function generateDarkPastelColor(seed: string): string {
  // Create a simple hash from the seed string
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use the hash to generate lighter pastel colors
  // Keep values in the 120-200 range for better pastel effect
  const r = Math.abs(hash) % 80 + 120; // 120-200 range
  const g = Math.abs(hash >> 8) % 80 + 120; // 120-200 range  
  const b = Math.abs(hash >> 16) % 80 + 120; // 120-200 range
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Test function to verify color generation
 * @param eventId - The event ID to test
 * @returns The generated color
 */
export function testColorGeneration(eventId: string): string {
  return generateDarkPastelColor(eventId);
} 