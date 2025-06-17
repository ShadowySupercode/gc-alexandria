# Test info

- Name: Shallow Copy POC Performance Validation >> star visualization toggle uses visual update path
- Location: /home/user/Documents/Programming/gc-alexandria/tests/e2e/poc-performance-validation.pw.spec.ts:34:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.network-svg') to be visible

    at /home/user/Documents/Programming/gc-alexandria/tests/e2e/poc-performance-validation.pw.spec.ts:30:16
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | // Performance thresholds based on POC targets
   4 | const PERFORMANCE_TARGETS = {
   5 |   visualUpdate: 50,    // <50ms for visual updates
   6 |   fullUpdate: 200,     // Baseline for full updates
   7 |   positionDrift: 5,    // Max pixels of position drift
   8 |   memoryIncrease: 10   // Max % memory increase per update
   9 | };
   10 |
   11 | test.describe('Shallow Copy POC Performance Validation', () => {
   12 |   // Helper to extract console logs
   13 |   const consoleLogs: string[] = [];
   14 |   
   15 |   test.beforeEach(async ({ page }) => {
   16 |     // Clear logs
   17 |     consoleLogs.length = 0;
   18 |     
   19 |     // Capture console logs
   20 |     page.on('console', msg => {
   21 |       if (msg.type() === 'log' && msg.text().includes('[EventNetwork]')) {
   22 |         consoleLogs.push(msg.text());
   23 |       }
   24 |     });
   25 |     
   26 |     // Navigate to visualization page
   27 |     await page.goto('http://localhost:5175/visualize');
   28 |     
   29 |     // Wait for initial load
>  30 |     await page.waitForSelector('.network-svg', { timeout: 10000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
   31 |     await page.waitForTimeout(2000); // Allow graph to stabilize
   32 |   });
   33 |
   34 |   test('star visualization toggle uses visual update path', async ({ page }) => {
   35 |     // Enable settings panel
   36 |     const settings = page.locator('.leather-legend').nth(1);
   37 |     const settingsToggle = settings.locator('button').first();
   38 |     await settingsToggle.click();
   39 |     
   40 |     // Ensure visual settings section is expanded
   41 |     const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
   42 |     await visualSettingsHeader.click();
   43 |     
   44 |     // Clear previous logs
   45 |     consoleLogs.length = 0;
   46 |     
   47 |     // Toggle star visualization
   48 |     const starToggle = settings.locator('label').filter({ hasText: 'Star Network View' }).locator('input[type="checkbox"]');
   49 |     await starToggle.click();
   50 |     
   51 |     // Wait for update
   52 |     await page.waitForTimeout(100);
   53 |     
   54 |     // Check logs for update type
   55 |     const updateLogs = consoleLogs.filter(log => log.includes('Update type detected'));
   56 |     expect(updateLogs.length).toBeGreaterThan(0);
   57 |     
   58 |     const lastUpdateLog = updateLogs[updateLogs.length - 1];
   59 |     expect(lastUpdateLog).toContain('kind: "visual"');
   60 |     expect(lastUpdateLog).toContain('star');
   61 |     
   62 |     // Check for visual properties update
   63 |     const visualUpdateLogs = consoleLogs.filter(log => log.includes('updateVisualProperties called'));
   64 |     expect(visualUpdateLogs.length).toBeGreaterThan(0);
   65 |     
   66 |     // Extract timing
   67 |     const timingLogs = consoleLogs.filter(log => log.includes('Visual properties updated in'));
   68 |     if (timingLogs.length > 0) {
   69 |       const match = timingLogs[0].match(/(\d+\.\d+)ms/);
   70 |       if (match) {
   71 |         const updateTime = parseFloat(match[1]);
   72 |         expect(updateTime).toBeLessThan(PERFORMANCE_TARGETS.visualUpdate);
   73 |         console.log(`Star toggle update time: ${updateTime}ms`);
   74 |       }
   75 |     }
   76 |   });
   77 |
   78 |   test('tag visibility toggle uses visual update path', async ({ page }) => {
   79 |     // Enable settings and tag anchors
   80 |     const settings = page.locator('.leather-legend').nth(1);
   81 |     const settingsToggle = settings.locator('button').first();
   82 |     await settingsToggle.click();
   83 |     
   84 |     // Enable tag anchors
   85 |     const visualSettingsHeader = settings.locator('.settings-section-header').filter({ hasText: 'Visual Settings' });
   86 |     await visualSettingsHeader.click();
   87 |     
   88 |     const tagAnchorsToggle = settings.locator('label').filter({ hasText: 'Show Tag Anchors' }).locator('input[type="checkbox"]');
   89 |     await tagAnchorsToggle.click();
   90 |     
   91 |     // Wait for tags to appear
   92 |     await page.waitForTimeout(1000);
   93 |     
   94 |     const legend = page.locator('.leather-legend').first();
   95 |     const tagSection = legend.locator('.legend-section').filter({ hasText: 'Active Tag Anchors' });
   96 |     
   97 |     if (await tagSection.count() > 0) {
   98 |       // Expand tag section if needed
   99 |       const tagHeader = tagSection.locator('.legend-section-header');
  100 |       const tagGrid = tagSection.locator('.tag-grid');
  101 |       if (!(await tagGrid.isVisible())) {
  102 |         await tagHeader.click();
  103 |       }
  104 |       
  105 |       // Clear logs
  106 |       consoleLogs.length = 0;
  107 |       
  108 |       // Toggle first tag
  109 |       const firstTag = tagGrid.locator('.tag-grid-item').first();
  110 |       await firstTag.click();
  111 |       
  112 |       // Wait for update
  113 |       await page.waitForTimeout(100);
  114 |       
  115 |       // Check for visual update
  116 |       const updateLogs = consoleLogs.filter(log => log.includes('Update type detected'));
  117 |       expect(updateLogs.length).toBeGreaterThan(0);
  118 |       
  119 |       const lastUpdateLog = updateLogs[updateLogs.length - 1];
  120 |       expect(lastUpdateLog).toContain('kind: "visual"');
  121 |       expect(lastUpdateLog).toContain('disabledCount');
  122 |       
  123 |       // Check timing
  124 |       const timingLogs = consoleLogs.filter(log => log.includes('Visual properties updated in'));
  125 |       if (timingLogs.length > 0) {
  126 |         const match = timingLogs[0].match(/(\d+\.\d+)ms/);
  127 |         if (match) {
  128 |           const updateTime = parseFloat(match[1]);
  129 |           expect(updateTime).toBeLessThan(PERFORMANCE_TARGETS.visualUpdate);
  130 |           console.log(`Tag toggle update time: ${updateTime}ms`);
```