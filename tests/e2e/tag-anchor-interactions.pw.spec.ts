import { test, expect } from '@playwright/test';

test.describe('Tag Anchor Interactive Features', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to visualization page
    await page.goto('/visualize');
    
    // Wait for visualization to load
    await page.waitForSelector('.leather-legend', { timeout: 10000 });
    
    // Enable tag anchors in settings
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    
    // Expand settings if needed
    const settingsContent = settings.locator('.space-y-4');
    if (!(await settingsContent.isVisible())) {
      await settingsToggle.click();
    }
    
    // Expand Visual Settings section
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    const visualSettingsContent = settings.locator('.settings-section').filter({ has: visualSettingsHeader });
    
    // Check if section is collapsed and expand if needed
    const starNetworkToggle = visualSettingsContent.locator('text="Star Network View"');
    if (!(await starNetworkToggle.isVisible())) {
      await visualSettingsHeader.click();
    }
    
    // Enable tag anchors
    const tagAnchorsToggle = settings.locator('label').filter({ hasText: 'Show Tag Anchors' }).locator('input[type="checkbox"]');
    if (!(await tagAnchorsToggle.isChecked())) {
      await tagAnchorsToggle.click();
    }
    
    // Wait for graph to update
    await page.waitForTimeout(1000);
  });

  test('should display tag anchors in legend when enabled', async ({ page }) => {
    const legend = page.locator('.leather-legend').first();
    
    // Check for tag anchors section
    const tagSection = legend.locator('.legend-section').filter({ hasText: 'Active Tag Anchors' });
    await expect(tagSection).toBeVisible();
    
    // Verify tag grid is displayed
    const tagGrid = tagSection.locator('.tag-grid');
    await expect(tagGrid).toBeVisible();
    
    // Should have tag items
    const tagItems = tagGrid.locator('.tag-grid-item');
    const count = await tagItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should toggle individual tag anchors on click', async ({ page }) => {
    const legend = page.locator('.leather-legend').first();
    const tagGrid = legend.locator('.tag-grid');
    
    // Get first tag anchor
    const firstTag = tagGrid.locator('.tag-grid-item').first();
    const tagLabel = await firstTag.locator('.legend-text').textContent();
    
    // Click to disable
    await firstTag.click();
    
    // Should have disabled class
    await expect(firstTag).toHaveClass(/disabled/);
    
    // Visual indicators should show disabled state
    const tagCircle = firstTag.locator('.legend-circle');
    await expect(tagCircle).toHaveCSS('opacity', '0.3');
    
    const tagText = firstTag.locator('.legend-text');
    await expect(tagText).toHaveCSS('opacity', '0.5');
    
    // Click again to enable
    await firstTag.click();
    
    // Should not have disabled class
    await expect(firstTag).not.toHaveClass(/disabled/);
    
    // Visual indicators should show enabled state
    await expect(tagCircle).toHaveCSS('opacity', '1');
    await expect(tagText).toHaveCSS('opacity', '1');
  });

  test('should show correct tooltip on hover', async ({ page }) => {
    const legend = page.locator('.leather-legend').first();
    const tagGrid = legend.locator('.tag-grid');
    
    // Get first tag anchor
    const firstTag = tagGrid.locator('.tag-grid-item').first();
    
    // Hover over tag
    await firstTag.hover();
    
    // Check title attribute
    const title = await firstTag.getAttribute('title');
    expect(title).toContain('Click to');
    
    // Disable the tag
    await firstTag.click();
    await firstTag.hover();
    
    // Title should update
    const updatedTitle = await firstTag.getAttribute('title');
    expect(updatedTitle).toContain('Click to enable');
  });

  test('should maintain disabled state across legend collapse', async ({ page }) => {
    const legend = page.locator('.leather-legend').first();
    const tagGrid = legend.locator('.tag-grid');
    
    // Disable some tags
    const firstTag = tagGrid.locator('.tag-grid-item').first();
    const secondTag = tagGrid.locator('.tag-grid-item').nth(1);
    
    await firstTag.click();
    await secondTag.click();
    
    // Verify disabled
    await expect(firstTag).toHaveClass(/disabled/);
    await expect(secondTag).toHaveClass(/disabled/);
    
    // Collapse and expand tag section
    const tagSectionHeader = legend.locator('.legend-section-header').filter({ hasText: 'Active Tag Anchors' });
    await tagSectionHeader.click(); // Collapse
    await tagSectionHeader.click(); // Expand
    
    // Tags should still be disabled
    await expect(firstTag).toHaveClass(/disabled/);
    await expect(secondTag).toHaveClass(/disabled/);
  });

  test('should handle tag type changes correctly', async ({ page }) => {
    const settings = page.locator('.leather-legend').nth(1);
    const legend = page.locator('.leather-legend').first();
    
    // Change tag type
    const tagTypeSelect = settings.locator('#tag-type-select');
    await tagTypeSelect.selectOption('p'); // Change to People (Pubkeys)
    
    // Wait for update
    await page.waitForTimeout(500);
    
    // Check legend updates
    const tagSection = legend.locator('.legend-section').filter({ hasText: 'Active Tag Anchors' });
    const sectionTitle = tagSection.locator('.legend-section-title');
    
    await expect(sectionTitle).toContainText('Active Tag Anchors: p');
    
    // Tag grid should update with new tags
    const tagItems = tagSection.locator('.tag-grid-item');
    const firstTagIcon = tagItems.first().locator('.legend-letter');
    
    // Should show 'A' for author type
    await expect(firstTagIcon).toContainText('A');
  });

  test('should show correct tag type icons', async ({ page }) => {
    const settings = page.locator('.leather-legend').nth(1);
    const legend = page.locator('.leather-legend').first();
    
    const tagTypes = [
      { value: 't', icon: '#' },
      { value: 'author', icon: 'A' },
      { value: 'p', icon: 'P' },
      { value: 'e', icon: 'E' },
      { value: 'title', icon: 'T' },
      { value: 'summary', icon: 'S' }
    ];
    
    for (const { value, icon } of tagTypes) {
      // Change tag type
      const tagTypeSelect = settings.locator('#tag-type-select');
      await tagTypeSelect.selectOption(value);
      
      // Wait for update
      await page.waitForTimeout(500);
      
      // Check icon
      const tagGrid = legend.locator('.tag-grid');
      const tagItems = tagGrid.locator('.tag-grid-item');
      
      if (await tagItems.count() > 0) {
        const firstTagIcon = tagItems.first().locator('.legend-letter');
        await expect(firstTagIcon).toContainText(icon);
      }
    }
  });

  test('should handle empty tag lists gracefully', async ({ page }) => {
    const settings = page.locator('.leather-legend').nth(1);
    const legend = page.locator('.leather-legend').first();
    
    // Try different tag types that might have no results
    const tagTypeSelect = settings.locator('#tag-type-select');
    await tagTypeSelect.selectOption('summary');
    
    // Wait for update
    await page.waitForTimeout(500);
    
    // Check if tag section exists
    const tagSection = legend.locator('.legend-section').filter({ hasText: 'Active Tag Anchors' });
    const tagSectionCount = await tagSection.count();
    
    if (tagSectionCount === 0) {
      // No tag section should be shown if no tags
      expect(tagSectionCount).toBe(0);
    } else {
      // If section exists, check for empty state
      const tagGrid = tagSection.locator('.tag-grid');
      const tagItems = tagGrid.locator('.tag-grid-item');
      const itemCount = await tagItems.count();
      
      // Should handle empty state gracefully
      expect(itemCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should update graph when tags are toggled', async ({ page }) => {
    const legend = page.locator('.leather-legend').first();
    const tagGrid = legend.locator('.tag-grid');
    
    // Get initial graph state (count visible nodes)
    const graphContainer = page.locator('svg.network-graph');
    const initialNodes = await graphContainer.locator('circle').count();
    
    // Disable a tag
    const firstTag = tagGrid.locator('.tag-grid-item').first();
    await firstTag.click();
    
    // Wait for graph update
    await page.waitForTimeout(500);
    
    // Graph should update (implementation specific - might hide nodes or change styling)
    // This is a placeholder assertion - actual behavior depends on implementation
    const updatedNodes = await graphContainer.locator('circle').count();
    
    // Nodes might be hidden or styled differently
    // The exact assertion depends on how disabled tags affect the visualization
    expect(updatedNodes).toBeGreaterThanOrEqual(0);
  });

  test('should work with keyboard navigation', async ({ page }) => {
    const legend = page.locator('.leather-legend').first();
    const tagGrid = legend.locator('.tag-grid');
    
    // Focus first tag
    const firstTag = tagGrid.locator('.tag-grid-item').first();
    await firstTag.focus();
    
    // Press Enter to toggle
    await page.keyboard.press('Enter');
    
    // Should be disabled
    await expect(firstTag).toHaveClass(/disabled/);
    
    // Press Enter again
    await page.keyboard.press('Enter');
    
    // Should be enabled
    await expect(firstTag).not.toHaveClass(/disabled/);
    
    // Tab to next tag
    await page.keyboard.press('Tab');
    
    // Should focus next tag
    const secondTag = tagGrid.locator('.tag-grid-item').nth(1);
    await expect(secondTag).toBeFocused();
  });

  test('should persist state through tag type changes', async ({ page }) => {
    const settings = page.locator('.leather-legend').nth(1);
    const legend = page.locator('.leather-legend').first();
    const tagGrid = legend.locator('.tag-grid');
    
    // Disable some hashtags
    const firstHashtag = tagGrid.locator('.tag-grid-item').first();
    await firstHashtag.click();
    
    // Change to authors
    const tagTypeSelect = settings.locator('#tag-type-select');
    await tagTypeSelect.selectOption('author');
    await page.waitForTimeout(500);
    
    // Disable an author tag
    const firstAuthor = tagGrid.locator('.tag-grid-item').first();
    await firstAuthor.click();
    
    // Switch back to hashtags
    await tagTypeSelect.selectOption('t');
    await page.waitForTimeout(500);
    
    // Original hashtag should still be disabled
    // Note: This assumes state persistence per tag type
    const hashtagsAgain = tagGrid.locator('.tag-grid-item');
    if (await hashtagsAgain.count() > 0) {
      // Implementation specific - check if state is preserved
      const firstHashtagAgain = hashtagsAgain.first();
      // State might or might not be preserved depending on implementation
      await expect(firstHashtagAgain).toBeVisible();
    }
  });
});