import { test, expect, type Page } from '@playwright/test';

// Utility to check for horizontal scroll bar
async function hasHorizontalScroll(page: Page, selector: string) {
  return await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    return el.scrollWidth > el.clientWidth;
  }, selector);
}

test.describe('My Notes Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/my-notes');
    await page.waitForSelector('h1:text("My Notes")');
  });

  test('no horizontal scroll bar for all tag type and tag filter combinations', async ({ page }) => {
    // Helper to check scroll for current state
    async function assertNoScroll() {
      const hasScroll = await hasHorizontalScroll(page, 'main, body, html');
      expect(hasScroll).toBeFalsy();
    }

    // Check default (no tag type selected)
    await assertNoScroll();

    // Get all tag type buttons
    const tagTypeButtons = await page.locator('aside button').all();
    // Only consider tag type buttons (first N)
    const tagTypeCount = await page.locator('aside > div.flex.flex-wrap.gap-2.mb-6 > button').count();
    // For each single tag type
    for (let i = 0; i < tagTypeCount; i++) {
      // Click tag type button
      await tagTypeButtons[i].click();
      await page.waitForTimeout(100); // Wait for UI update
      await assertNoScroll();
      // Get tag filter buttons (after tag type buttons)
      const tagFilterButtons = await page.locator('aside > div.flex.flex-wrap.gap-2.mb-4 > button').all();
      // Try all single tag filter selections
      for (let j = 0; j < tagFilterButtons.length; j++) {
        await tagFilterButtons[j].click();
        await page.waitForTimeout(100);
        await assertNoScroll();
        // Deselect
        await tagFilterButtons[j].click();
        await page.waitForTimeout(50);
      }
      // Try all pairs of tag filter selections
      for (let j = 0; j < tagFilterButtons.length; j++) {
        for (let k = j + 1; k < tagFilterButtons.length; k++) {
          await tagFilterButtons[j].click();
          await tagFilterButtons[k].click();
          await page.waitForTimeout(100);
          await assertNoScroll();
          // Deselect
          await tagFilterButtons[j].click();
          await tagFilterButtons[k].click();
          await page.waitForTimeout(50);
        }
      }
      // Deselect tag type
      await tagTypeButtons[i].click();
      await page.waitForTimeout(100);
    }

    // Try all pairs of tag type selections (multi-select)
    for (let i = 0; i < tagTypeCount; i++) {
      for (let j = i + 1; j < tagTypeCount; j++) {
        await tagTypeButtons[i].click();
        await tagTypeButtons[j].click();
        await page.waitForTimeout(100);
        await assertNoScroll();
        // Get tag filter buttons for this combination
        const tagFilterButtons = await page.locator('aside > div.flex.flex-wrap.gap-2.mb-4 > button').all();
        // Try all single tag filter selections
        for (let k = 0; k < tagFilterButtons.length; k++) {
          await tagFilterButtons[k].click();
          await page.waitForTimeout(100);
          await assertNoScroll();
          await tagFilterButtons[k].click();
          await page.waitForTimeout(50);
        }
        // Try all pairs of tag filter selections
        for (let k = 0; k < tagFilterButtons.length; k++) {
          for (let l = k + 1; l < tagFilterButtons.length; l++) {
            await tagFilterButtons[k].click();
            await tagFilterButtons[l].click();
            await page.waitForTimeout(100);
            await assertNoScroll();
            await tagFilterButtons[k].click();
            await tagFilterButtons[l].click();
            await page.waitForTimeout(50);
          }
        }
        // Deselect tag types
        await tagTypeButtons[i].click();
        await tagTypeButtons[j].click();
        await page.waitForTimeout(100);
      }
    }
  });
}); 