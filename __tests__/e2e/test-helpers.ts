/**
 * E2E Test Helper Functions
 *
 * Common utilities for PDQ Worker Pool E2E tests
 */

import { Page, expect } from '@playwright/test';

/**
 * DOM Element Parsing Helpers
 * Centralized helper to parse integer values from DOM elements
 * This pattern handles contexts where document may not exist and provides consistent error handling
 */

/**
 * Helper function to parse an element's text content as an integer
 * Usage in page.evaluate(): parseInt(document.getElementById('id')?.textContent || '0')
 */
const parseElement = (id: string) => `parseInt(document.getElementById('${id}')?.textContent || '0')`;

/**
 * Wait for files to be loaded (state-based check)
 */
export async function waitForFilesLoaded(page: Page, timeout = 5000) {
  await page.waitForFunction(() => {
    const total = parseInt(document.getElementById('total-files')?.textContent || '0');
    return total > 0;
  }, { timeout });
}

/**
 * Wait for processing to start (files loaded and some activity)
 */
export async function waitForProcessingStarted(page: Page, timeout = 5000) {
  await page.waitForFunction(() => {
    const total = parseInt(document.getElementById('total-files')?.textContent || '0');
    const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
    const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
    // Files loaded and either currently processing or some already processed
    return total > 0 && (processing > 0 || processed > 0);
  }, { timeout });
}

/**
 * Wait for all processing to complete
 */
export async function waitForProcessingComplete(page: Page, timeout = 60000) {
  await page.waitForFunction(() => {
    const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
    const total = parseInt(document.getElementById('total-files')?.textContent || '0');
    const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
    const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
    // Processing complete and all files accounted for
    return processing === 0 && total > 0 && (processed + failed) === total;
  }, { timeout });
}

/**
 * Wait for all workers to be ready (idle status)
 */
export async function waitForWorkersReady(page: Page, workerCount: number, timeout = 15000) {
  await page.waitForFunction((count) => {
    const stats = Array.from((window as any).workerStats.values());
    return stats.length === count && stats.every((stat: any) => stat.status === 'idle');
  }, workerCount, { timeout });
}

/**
 * Get processing results from the page
 */
export async function getResults(page: Page) {
  return await page.evaluate(() => (window as any).getResults());
}

/**
 * Get worker statistics
 */
export async function getWorkerStats(page: Page) {
  return await page.evaluate(() => {
    const stats = Array.from((window as any).workerStats.values());
    return stats.map((stat: any) => ({
      id: stat.id,
      status: stat.status,
      processed: stat.processed,
      errors: stat.errors
    }));
  });
}

/**
 * Get error messages from the page
 */
export async function getErrorMessages(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    return (window as any).errorMessages || [];
  });
}

/**
 * Reset the test state
 */
export async function resetTest(page: Page) {
  await page.click('#reset-test');

  // Wait for reset to complete (stats cleared)
  await page.waitForFunction(() => {
    const total = parseInt(document.getElementById('total-files')?.textContent || '0');
    const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
    const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
    const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
    return total === 0 && processed === 0 && processing === 0 && failed === 0;
  }, { timeout: 2000 });
}

/**
 * Assert that the start button is enabled (uses Playwright's auto-retry)
 */
export async function assertStartButtonEnabled(page: Page) {
  await expect(page.locator('#start-test')).toBeEnabled();
}

/**
 * Start the processing test
 */
export async function startTest(page: Page) {
  await page.click('#start-test');
}

/**
 * Try to observe workers in busy state (may be too fast, so don't fail)
 */
export async function tryObserveBusyWorkers(page: Page, minBusy = 2, timeout = 2000): Promise<boolean> {
  try {
    await page.waitForFunction((min) => {
      const stats = Array.from((window as any).workerStats.values());
      const busyCount = stats.filter((stat: any) => stat.status === 'busy').length;
      return busyCount >= min;
    }, minBusy, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inject a test file into the processing queue
 */
export async function injectTestFile(page: Page, file: { name: string; type: string; data: Uint8Array }) {
  await page.evaluate((fileData) => {
    // Pass the object directly as expected by window.injectTestFile
    (window as any).injectTestFile(fileData);
  }, { ...file, data: Array.from(file.data) });
}
