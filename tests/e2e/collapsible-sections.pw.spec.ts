import { test, expect } from '@playwright/test';

test.describe('Collapsible Sections UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the visualization page
    await page.goto('/visualize');
    // Wait for the visualization to load
    await page.waitForSelector('.leather-legend', { timeout: 10000 });
  });

  test.describe('Legend Component', () => {
    test('should toggle main legend collapse/expand', async ({ page }) => {
      const legend = page.locator('.leather-legend').first();
      const legendContent = legend.locator('.legend-content');
      const toggleButton = legend.locator('button').first();

      // Legend should be expanded by default
      await expect(legendContent).toBeVisible();

      // Click to collapse
      await toggleButton.click();
      await expect(legendContent).not.toBeVisible();

      // Click to expand
      await toggleButton.click();
      await expect(legendContent).toBeVisible();
    });

    test('should toggle Node Types section independently', async ({ page }) => {
      const legend = page.locator('.leather-legend').first();
      const nodeTypesSection = legend.locator('.legend-section').first();
      const nodeTypesHeader = nodeTypesSection.locator('.legend-section-header');
      const nodeTypesList = nodeTypesSection.locator('.legend-list');

      // Node Types should be expanded by default
      await expect(nodeTypesList).toBeVisible();

      // Click header to collapse
      await nodeTypesHeader.click();
      await expect(nodeTypesList).not.toBeVisible();

      // Click header to expand
      await nodeTypesHeader.click();
      await expect(nodeTypesList).toBeVisible();
    });

    test('should toggle Tag Anchors section independently when visible', async ({ page }) => {
      // First enable tag anchors in settings
      const settings = page.locator('.leather-legend').nth(1);
      const settingsToggle = settings.locator('button').first();
      
      // Expand settings if needed
      const settingsContent = settings.locator('.space-y-4');
      if (!(await settingsContent.isVisible())) {
        await settingsToggle.click();
      }

      // Enable tag anchors
      const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
      await visualSettingsHeader.click();
      
      const tagAnchorsToggle = settings.locator('label').filter({ hasText: 'Show Tag Anchors' }).locator('input[type="checkbox"]');
      if (!(await tagAnchorsToggle.isChecked())) {
        await tagAnchorsToggle.click();
      }

      // Wait for tag anchors to appear in legend
      await page.waitForTimeout(1000); // Allow time for graph update

      const legend = page.locator('.leather-legend').first();
      const tagSection = legend.locator('.legend-section').filter({ hasText: 'Active Tag Anchors' });
      
      if (await tagSection.count() > 0) {
        const tagHeader = tagSection.locator('.legend-section-header');
        const tagGrid = tagSection.locator('.tag-grid');

        // Should be expanded by default
        await expect(tagGrid).toBeVisible();

        // Click to collapse
        await tagHeader.click();
        await expect(tagGrid).not.toBeVisible();

        // Click to expand
        await tagHeader.click();
        await expect(tagGrid).toBeVisible();
      }
    });

    test('should maintain section states independently', async ({ page }) => {
      const legend = page.locator('.leather-legend').first();
      const nodeTypesSection = legend.locator('.legend-section').first();
      const nodeTypesHeader = nodeTypesSection.locator('.legend-section-header');
      const nodeTypesList = nodeTypesSection.locator('.legend-list');

      // Collapse Node Types section
      await nodeTypesHeader.click();
      await expect(nodeTypesList).not.toBeVisible();

      // Toggle main legend
      const toggleButton = legend.locator('button').first();
      await toggleButton.click(); // Collapse
      await toggleButton.click(); // Expand

      // Node Types should still be collapsed
      await expect(nodeTypesList).not.toBeVisible();
    });
  });

  test.describe('Settings Component', () => {
    test('should toggle main settings collapse/expand', async ({ page }) => {
      const settings = page.locator('.leather-legend').nth(1);
      const settingsContent = settings.locator('.space-y-4');
      const toggleButton = settings.locator('button').first();

      // Settings should be collapsed by default
      await expect(settingsContent).not.toBeVisible();

      // Click to expand
      await toggleButton.click();
      await expect(settingsContent).toBeVisible();

      // Click to collapse
      await toggleButton.click();
      await expect(settingsContent).not.toBeVisible();
    });

    test('should toggle all settings sections independently', async ({ page }) => {
      const settings = page.locator('.leather-legend').nth(1);
      const toggleButton = settings.locator('button').first();
      
      // Expand settings
      await toggleButton.click();

      const sections = [
        { name: 'Event Types', contentSelector: 'text="Event Kind Filter"' },
        { name: 'Initial Load', contentSelector: 'text="Network Fetch Limit"' },
        { name: 'Display Limits', contentSelector: 'text="Max Publication Indices"' },
        { name: 'Graph Traversal', contentSelector: 'text="Search through already fetched"' },
        { name: 'Visual Settings', contentSelector: 'text="Star Network View"' }
      ];

      for (const section of sections) {
        const sectionHeader = settings.locator('.settings-section-header').filter({ hasText: section.name });
        const sectionContent = settings.locator('.settings-section').filter({ has: sectionHeader });

        // All sections should be expanded by default
        await expect(sectionContent.locator(section.contentSelector)).toBeVisible();

        // Click to collapse
        await sectionHeader.click();
        await expect(sectionContent.locator(section.contentSelector)).not.toBeVisible();

        // Click to expand
        await sectionHeader.click();
        await expect(sectionContent.locator(section.contentSelector)).toBeVisible();
      }
    });

    test('should preserve section states when toggling main settings', async ({ page }) => {
      const settings = page.locator('.leather-legend').nth(1);
      const toggleButton = settings.locator('button').first();
      
      // Expand settings
      await toggleButton.click();

      // Collapse some sections
      const eventTypesHeader = settings.locator('.settings-section-header').filter({ hasText: 'Event Types' });
      const displayLimitsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Display Limits' });
      
      await eventTypesHeader.click();
      await displayLimitsHeader.click();

      // Verify they are collapsed
      const eventTypesContent = settings.locator('.settings-section').filter({ has: eventTypesHeader });
      const displayLimitsContent = settings.locator('.settings-section').filter({ has: displayLimitsHeader });
      
      await expect(eventTypesContent.locator('text="Event Kind Filter"')).not.toBeVisible();
      await expect(displayLimitsContent.locator('text="Max Publication Indices"')).not.toBeVisible();

      // Toggle main settings
      await toggleButton.click(); // Collapse
      await toggleButton.click(); // Expand

      // Sections should maintain their collapsed state
      await expect(eventTypesContent.locator('text="Event Kind Filter"')).not.toBeVisible();
      await expect(displayLimitsContent.locator('text="Max Publication Indices"')).not.toBeVisible();

      // Other sections should still be expanded
      const visualSettingsContent = settings.locator('.settings-section').filter({ 
        has: settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' }) 
      });
      await expect(visualSettingsContent.locator('text="Star Network View"')).toBeVisible();
    });

    test('should show hover effect on section headers', async ({ page }) => {
      const settings = page.locator('.leather-legend').nth(1);
      const toggleButton = settings.locator('button').first();
      
      // Expand settings
      await toggleButton.click();

      const eventTypesHeader = settings.locator('.settings-section-header').filter({ hasText: 'Event Types' });
      
      // Hover over header
      await eventTypesHeader.hover();
      
      // Check for hover styles (background color change)
      // Note: This is a basic check, actual hover styles depend on CSS
      await expect(eventTypesHeader).toHaveCSS('cursor', 'pointer');
    });
  });

  test.describe('Icon State Changes', () => {
    test('should show correct caret icons for expand/collapse states', async ({ page }) => {
      const legend = page.locator('.leather-legend').first();
      const settings = page.locator('.leather-legend').nth(1);

      // Check main toggle buttons
      const legendToggle = legend.locator('button').first();
      const settingsToggle = settings.locator('button').first();

      // Legend starts expanded (shows up caret)
      await expect(legendToggle.locator('svg')).toHaveAttribute('class', /CaretUpOutline/);
      
      // Click to collapse (should show down caret)
      await legendToggle.click();
      await expect(legendToggle.locator('svg')).toHaveAttribute('class', /CaretDownOutline/);

      // Settings starts collapsed (shows down caret)
      await expect(settingsToggle.locator('svg')).toHaveAttribute('class', /CaretDownOutline/);
      
      // Click to expand (should show up caret)
      await settingsToggle.click();
      await expect(settingsToggle.locator('svg')).toHaveAttribute('class', /CaretUpOutline/);

      // Check section toggles
      const eventTypesHeader = settings.locator('.settings-section-header').filter({ hasText: 'Event Types' });
      const eventTypesButton = eventTypesHeader.locator('button');

      // Section starts expanded
      await expect(eventTypesButton.locator('svg')).toHaveAttribute('class', /CaretUpOutline/);
      
      // Click to collapse
      await eventTypesHeader.click();
      await expect(eventTypesButton.locator('svg')).toHaveAttribute('class', /CaretDownOutline/);
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should maintain functionality on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      const legend = page.locator('.leather-legend').first();
      const settings = page.locator('.leather-legend').nth(1);

      // Test basic toggle functionality still works
      const legendToggle = legend.locator('button').first();
      const settingsToggle = settings.locator('button').first();

      const legendContent = legend.locator('.legend-content');
      
      // Toggle legend
      await expect(legendContent).toBeVisible();
      await legendToggle.click();
      await expect(legendContent).not.toBeVisible();

      // Expand settings and test section toggle
      await settingsToggle.click();
      const eventTypesHeader = settings.locator('.settings-section-header').filter({ hasText: 'Event Types' });
      const eventTypesContent = settings.locator('.settings-section').filter({ has: eventTypesHeader });
      
      await expect(eventTypesContent.locator('text="Event Kind Filter"')).toBeVisible();
      await eventTypesHeader.click();
      await expect(eventTypesContent.locator('text="Event Kind Filter"')).not.toBeVisible();
    });
  });
});