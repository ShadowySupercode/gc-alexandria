import { test, expect } from '@playwright/test';

// Performance thresholds based on POC targets
const PERFORMANCE_TARGETS = {
  visualUpdate: 50,    // <50ms for visual updates
  fullUpdate: 200,     // Baseline for full updates
  positionDrift: 5,    // Max pixels of position drift
  memoryIncrease: 10   // Max % memory increase per update
};

test.describe('Shallow Copy POC Performance Validation', () => {
  // Helper to extract console logs
  const consoleLogs: string[] = [];
  
  test.beforeEach(async ({ page }) => {
    // Clear logs
    consoleLogs.length = 0;
    
    // Capture console logs
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('[EventNetwork]')) {
        consoleLogs.push(msg.text());
      }
    });
    
    // Navigate to visualization page
    await page.goto('http://localhost:5175/visualize');
    
    // Wait for initial load
    await page.waitForSelector('.network-svg', { timeout: 10000 });
    await page.waitForTimeout(2000); // Allow graph to stabilize
  });

  test('star visualization toggle uses visual update path', async ({ page }) => {
    // Enable settings panel
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    // Ensure visual settings section is expanded
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    // Clear previous logs
    consoleLogs.length = 0;
    
    // Toggle star visualization
    const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
    await starToggle.click();
    
    // Wait for update
    await page.waitForTimeout(100);
    
    // Check logs for update type
    const updateLogs = consoleLogs.filter(log => log.includes('Update type detected'));
    expect(updateLogs.length).toBeGreaterThan(0);
    
    const lastUpdateLog = updateLogs[updateLogs.length - 1];
    expect(lastUpdateLog).toContain('kind: "visual"');
    expect(lastUpdateLog).toContain('star');
    
    // Check for visual properties update
    const visualUpdateLogs = consoleLogs.filter(log => log.includes('updateVisualProperties called'));
    expect(visualUpdateLogs.length).toBeGreaterThan(0);
    
    // Extract timing
    const timingLogs = consoleLogs.filter(log => log.includes('Visual properties updated in'));
    if (timingLogs.length > 0) {
      const match = timingLogs[0].match(/(\d+\.\d+)ms/);
      if (match) {
        const updateTime = parseFloat(match[1]);
        expect(updateTime).toBeLessThan(PERFORMANCE_TARGETS.visualUpdate);
        console.log(`Star toggle update time: ${updateTime}ms`);
      }
    }
  });

  test('tag visibility toggle uses visual update path', async ({ page }) => {
    // Enable settings and tag anchors
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    // Enable tag anchors
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    const tagAnchorsToggle = settings.locator('label').filter({ hasText: 'Show Tag Anchors' }).locator('input[type="checkbox"]');
    await tagAnchorsToggle.click();
    
    // Wait for tags to appear
    await page.waitForTimeout(1000);
    
    const legend = page.locator('.leather-legend').first();
    const tagSection = legend.locator('.legend-section').filter({ hasText: 'Active Tag Anchors' });
    
    if (await tagSection.count() > 0) {
      // Expand tag section if needed
      const tagHeader = tagSection.locator('.legend-section-header');
      const tagGrid = tagSection.locator('.tag-grid');
      if (!(await tagGrid.isVisible())) {
        await tagHeader.click();
      }
      
      // Clear logs
      consoleLogs.length = 0;
      
      // Toggle first tag
      const firstTag = tagGrid.locator('.tag-grid-item').first();
      await firstTag.click();
      
      // Wait for update
      await page.waitForTimeout(100);
      
      // Check for visual update
      const updateLogs = consoleLogs.filter(log => log.includes('Update type detected'));
      expect(updateLogs.length).toBeGreaterThan(0);
      
      const lastUpdateLog = updateLogs[updateLogs.length - 1];
      expect(lastUpdateLog).toContain('kind: "visual"');
      expect(lastUpdateLog).toContain('disabledCount');
      
      // Check timing
      const timingLogs = consoleLogs.filter(log => log.includes('Visual properties updated in'));
      if (timingLogs.length > 0) {
        const match = timingLogs[0].match(/(\d+\.\d+)ms/);
        if (match) {
          const updateTime = parseFloat(match[1]);
          expect(updateTime).toBeLessThan(PERFORMANCE_TARGETS.visualUpdate);
          console.log(`Tag toggle update time: ${updateTime}ms`);
        }
      }
    }
  });

  test('position preservation during visual updates', async ({ page }) => {
    // Get initial node positions
    const getNodePositions = async () => {
      return await page.evaluate(() => {
        const nodes = document.querySelectorAll('.network-svg g.node');
        const positions: { [id: string]: { x: number; y: number } } = {};
        
        nodes.forEach((node) => {
          const transform = node.getAttribute('transform');
          const match = transform?.match(/translate\(([\d.-]+),([\d.-]+)\)/);
          if (match) {
            const nodeId = (node as any).__data__?.id || 'unknown';
            positions[nodeId] = {
              x: parseFloat(match[1]),
              y: parseFloat(match[2])
            };
          }
        });
        
        return positions;
      });
    };
    
    // Capture initial positions
    const initialPositions = await getNodePositions();
    const nodeCount = Object.keys(initialPositions).length;
    expect(nodeCount).toBeGreaterThan(0);
    
    // Toggle star visualization
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
    await starToggle.click();
    
    // Wait for visual update
    await page.waitForTimeout(500);
    
    // Get positions after update
    const updatedPositions = await getNodePositions();
    
    // Check position preservation
    let maxDrift = 0;
    let driftCount = 0;
    
    Object.keys(initialPositions).forEach(nodeId => {
      if (updatedPositions[nodeId]) {
        const initial = initialPositions[nodeId];
        const updated = updatedPositions[nodeId];
        const drift = Math.sqrt(
          Math.pow(updated.x - initial.x, 2) + 
          Math.pow(updated.y - initial.y, 2)
        );
        
        if (drift > PERFORMANCE_TARGETS.positionDrift) {
          driftCount++;
          maxDrift = Math.max(maxDrift, drift);
        }
      }
    });
    
    // Positions should be mostly preserved (some drift due to force changes is OK)
    const driftPercentage = (driftCount / nodeCount) * 100;
    expect(driftPercentage).toBeLessThan(20); // Less than 20% of nodes should drift significantly
    console.log(`Position drift: ${driftCount}/${nodeCount} nodes (${driftPercentage.toFixed(1)}%), max drift: ${maxDrift.toFixed(1)}px`);
  });

  test('simulation maintains momentum', async ({ page }) => {
    // Check simulation alpha values in logs
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    // Clear logs
    consoleLogs.length = 0;
    
    // Toggle star mode
    const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
    await starToggle.click();
    
    await page.waitForTimeout(100);
    
    // Check for gentle restart
    const alphaLogs = consoleLogs.filter(log => log.includes('simulation restarted with alpha'));
    expect(alphaLogs.length).toBeGreaterThan(0);
    
    // Should use alpha 0.3 for visual updates
    expect(alphaLogs[0]).toContain('alpha 0.3');
  });

  test('rapid parameter changes are handled efficiently', async ({ page }) => {
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    // Clear logs
    consoleLogs.length = 0;
    
    // Perform rapid toggles
    const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
    
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await starToggle.click();
      await page.waitForTimeout(50); // Very short delay
    }
    const totalTime = Date.now() - startTime;
    
    // Check that all updates completed
    await page.waitForTimeout(500);
    
    // Count visual updates
    const visualUpdateCount = consoleLogs.filter(log => log.includes('updateVisualProperties called')).length;
    expect(visualUpdateCount).toBeGreaterThanOrEqual(3); // At least some updates should process
    
    console.log(`Rapid toggle test: ${visualUpdateCount} visual updates in ${totalTime}ms`);
  });

  test('memory stability during visual updates', async ({ page }) => {
    // Get initial memory usage
    const getMemoryUsage = async () => {
      return await page.evaluate(() => {
        if ('memory' in performance) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });
    };
    
    const initialMemory = await getMemoryUsage();
    if (initialMemory === 0) {
      test.skip();
      return;
    }
    
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
    
    // Perform multiple toggles
    for (let i = 0; i < 10; i++) {
      await starToggle.click();
      await page.waitForTimeout(100);
    }
    
    // Force garbage collection if available
    await page.evaluate(() => {
      if ('gc' in window) {
        (window as any).gc();
      }
    });
    
    await page.waitForTimeout(1000);
    
    const finalMemory = await getMemoryUsage();
    const memoryIncrease = ((finalMemory - initialMemory) / initialMemory) * 100;
    
    console.log(`Memory usage: Initial ${(initialMemory / 1024 / 1024).toFixed(2)}MB, Final ${(finalMemory / 1024 / 1024).toFixed(2)}MB, Increase: ${memoryIncrease.toFixed(2)}%`);
    
    // Memory increase should be minimal
    expect(memoryIncrease).toBeLessThan(PERFORMANCE_TARGETS.memoryIncrease);
  });

  test('comparison: visual update vs full update performance', async ({ page }) => {
    const settings = page.locator('.leather-legend').nth(1);
    const settingsToggle = settings.locator('button').first();
    await settingsToggle.click();
    
    // Test visual update (star toggle)
    const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
    await visualSettingsHeader.click();
    
    consoleLogs.length = 0;
    const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
    await starToggle.click();
    await page.waitForTimeout(200);
    
    let visualUpdateTime = 0;
    const visualTimingLogs = consoleLogs.filter(log => log.includes('Visual properties updated in'));
    if (visualTimingLogs.length > 0) {
      const match = visualTimingLogs[0].match(/(\d+\.\d+)ms/);
      if (match) {
        visualUpdateTime = parseFloat(match[1]);
      }
    }
    
    // Test full update (fetch limit change)
    const initialLoadHeader = settings.locator('.settings-section-header').filter({ hasText: 'Initial Load' });
    await initialLoadHeader.click();
    
    consoleLogs.length = 0;
    const fetchLimitInput = settings.locator('input[type="number"]').first();
    await fetchLimitInput.fill('20');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    let fullUpdateTime = 0;
    const fullTimingLogs = consoleLogs.filter(log => log.includes('updateGraph completed in'));
    if (fullTimingLogs.length > 0) {
      const match = fullTimingLogs[0].match(/(\d+\.\d+)ms/);
      if (match) {
        fullUpdateTime = parseFloat(match[1]);
      }
    }
    
    console.log(`Performance comparison:
    - Visual update: ${visualUpdateTime.toFixed(2)}ms
    - Full update: ${fullUpdateTime.toFixed(2)}ms
    - Improvement: ${((1 - visualUpdateTime / fullUpdateTime) * 100).toFixed(1)}%`);
    
    // Visual updates should be significantly faster
    expect(visualUpdateTime).toBeLessThan(fullUpdateTime * 0.5); // At least 50% faster
    expect(visualUpdateTime).toBeLessThan(PERFORMANCE_TARGETS.visualUpdate);
  });
});