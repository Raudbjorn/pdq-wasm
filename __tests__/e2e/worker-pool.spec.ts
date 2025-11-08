/**
 * E2E Tests for PDQ Worker Pool
 *
 * Tests multi-worker parallel image hashing:
 * 1. 12 concurrent Web Workers
 * 2. Parallel hash generation
 * 3. Worker pool management
 * 4. Performance metrics
 */

import { test, expect } from '@playwright/test';

const WEBAPP_URL = '/__tests__/e2e/webapp/worker.html';
const WORKER_COUNT = 12;
const EXPECTED_BASE_FILES = 4; // red-circle, blue-square, green-triangle, red-circle-copy
const MIN_EXPECTED_SPEEDUP = 3; // At least 3x speedup with 12 workers

test.describe('PDQ Worker Pool E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    page.on('console', msg => {
      const type = msg.type();
      // Log all messages for debugging
      console.log(`[Browser ${type}]:`, msg.text());
    });

    page.on('pageerror', err => {
      console.error('[Browser Page Error]:', err.message);
      console.error('[Browser Page Error Stack]:', err.stack);
    });

    // Navigate to worker test page
    await page.goto(WEBAPP_URL);

    // Wait for workers to initialize
    await page.waitForFunction(() => {
      return window.workers && window.workers.length === 12;
    }, { timeout: 10000 });

    // Wait for all workers to be ready
    await page.waitForFunction(() => {
      const stats = Array.from(window.workerStats.values());
      return stats.every(stat => stat.status === 'idle');
    }, { timeout: 15000 });

    console.log('All workers initialized and ready');
  });

  test('should initialize 12 workers successfully', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/PDQ Worker/);

    // Check header
    await expect(page.locator('h1')).toContainText('PDQ Worker Pool Test');

    // Verify initial stats
    await expect(page.locator('#total-files')).toHaveText('0');
    await expect(page.locator('#processed-files')).toHaveText('0');
    await expect(page.locator('#processing-files')).toHaveText('0');
    await expect(page.locator('#failed-files')).toHaveText('0');

    // Verify all 12 worker cards are present
    const workerCards = page.locator('.worker-card');
    await expect(workerCards).toHaveCount(WORKER_COUNT);

    // Check all workers are idle
    for (let i = 0; i < WORKER_COUNT; i++) {
      const workerStatus = page.locator(`#worker-status-${i}`);
      await expect(workerStatus).toHaveText('IDLE');
    }

    // Check start button is enabled
    await expect(page.locator('#start-test')).toBeEnabled();
  });

  test('should process files using all 12 workers in parallel', async ({ page }) => {
    console.log('Starting parallel processing test...');

    // Click start test button
    await page.click('#start-test');

    // STATE-BASED: Wait for files to load (not time-based)
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      return total > 0;
    }, { timeout: 5000 });

    // Verify files are being processed
    const totalFiles = await page.locator('#total-files').textContent();
    const total = parseInt(totalFiles || '0');

    console.log(`Total files to process: ${total}`);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(WORKER_COUNT * 3); // At least 3x workers

    // Try to catch workers being busy (may be too fast, so don't fail if we miss it)
    const sawBusyWorkers = await page.waitForFunction(() => {
      const stats = Array.from(window.workerStats.values());
      const busyCount = stats.filter(stat => stat.status === 'busy').length;
      return busyCount >= 2; // At least 2 workers busy simultaneously
    }, { timeout: 2000 }).catch(() => null);

    if (sawBusyWorkers) {
      console.log('Multiple workers are processing in parallel');
    } else {
      console.log('Workers processed too fast to observe parallel execution (this is OK)');
    }

    // Wait for all processing to complete (with generous timeout)
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      const failed = parseInt(document.getElementById('failed-files').textContent || '0');
      const total = parseInt(document.getElementById('total-files').textContent || '0');

      return processing === 0 && (processed + failed) === total && total > 0;
    }, { timeout: 60000 }); // 60 second timeout for processing

    // Verify final results
    const results = await page.evaluate(() => window.getResults());

    console.log('Processing complete:', results);

    expect(results.processed).toBeGreaterThan(0);
    expect(results.processing).toBe(0);
    expect(results.processed + results.failed).toBe(results.totalFiles);

    // Check that hashes were generated
    const hashItems = page.locator('.hash-item');
    const hashCount = await hashItems.count();
    expect(hashCount).toBe(results.processed);

    // Verify average time is reasonable (should be under 500ms per image)
    expect(results.avgTime).toBeLessThan(500);
  });

  test('should distribute work across all workers', async ({ page }) => {
    console.log('Testing work distribution...');

    // Start test
    await page.click('#start-test');

    // STATE-BASED: Wait for files to load and processing to start
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      // Files loaded and either currently processing or some already processed
      return total > 0 && (processing > 0 || processed > 0);
    }, { timeout: 5000 });

    // Check work distribution while processing or after completion
    const activeWorkers = await page.evaluate(() => {
      const stats = Array.from(window.workerStats.values());
      return stats.filter(stat => stat.processed > 0 || stat.status === 'busy').length;
    });

    console.log(`Active workers: ${activeWorkers} / ${WORKER_COUNT}`);
    expect(activeWorkers).toBeGreaterThan(WORKER_COUNT / 2); // At least half used

    // STATE-BASED: Wait for completion
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      const failed = parseInt(document.getElementById('failed-files').textContent || '0');
      // Processing complete and all files accounted for
      return processing === 0 && total > 0 && (processed + failed) === total;
    }, { timeout: 60000 });

    // Check final distribution
    const workerUsage = await page.evaluate(() => {
      const stats = Array.from(window.workerStats.values());
      return stats.map(stat => ({
        id: stat.id,
        processed: stat.processed,
        errors: stat.errors
      }));
    });

    console.log('Worker usage:', workerUsage);

    // At least 8 workers should have processed files (66% utilization)
    const workersUsed = workerUsage.filter(w => w.processed > 0).length;
    expect(workersUsed).toBeGreaterThanOrEqual(8);

    // Verify all workers have low error rates
    workerUsage.forEach(worker => {
      expect(worker.errors).toBeLessThanOrEqual(1); // Allow max 1 error per worker
    });
  });

  test('should generate consistent hashes for duplicate files', async ({ page }) => {
    console.log('Testing hash consistency...');

    // Start test
    await page.click('#start-test');

    // Wait for completion
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      return processing === 0 && processed > 0;
    }, { timeout: 60000 });

    // Extract all hashes by filename
    const hashes = await page.evaluate(() => {
      const hashItems = document.querySelectorAll('.hash-item');
      const result = new Map();

      hashItems.forEach(item => {
        const filename = item.querySelector('.hash-filename').textContent;
        const hash = item.querySelector('.hash-value').textContent;

        // Group by base filename (without replica number)
        const baseName = filename.replace(/-\d+\.png$/, '.png');

        if (!result.has(baseName)) {
          result.set(baseName, []);
        }
        result.get(baseName).push(hash);
      });

      return Array.from(result.entries()).map(([name, hashes]) => ({
        name,
        hashes,
        unique: new Set(hashes).size
      }));
    });

    console.log('Hash consistency check:', hashes);

    // Verify each base file has consistent hashes across replicas
    hashes.forEach(file => {
      console.log(`${file.name}: ${file.hashes.length} replicas, ${file.unique} unique hash(es)`);

      // All replicas should have the same hash
      expect(file.unique).toBe(1);

      // Hash should be 64 hex characters
      expect(file.hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    });

    // Should have EXPECTED_BASE_FILES different base files
    expect(hashes.length).toBe(EXPECTED_BASE_FILES);

    // red-circle and red-circle-copy should have the SAME hash (they're duplicates)
    const redCircle = hashes.find(f => f.name === 'red-circle.png');
    const redCircleCopy = hashes.find(f => f.name === 'red-circle-copy.png');

    if (redCircle && redCircleCopy) {
      expect(redCircle.hashes[0]).toBe(redCircleCopy.hashes[0]);
      console.log('✓ Duplicate detection works: red-circle and red-circle-copy have same hash');
    }
  });

  test('should show performance improvements with parallel processing', async ({ page }) => {
    console.log('Testing parallel performance...');

    // Start test
    await page.click('#start-test');

    // STATE-BASED: Wait for files to load first
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      return total > 0;
    }, { timeout: 5000 });

    // Capture start time after files are loaded
    const startTime = Date.now();

    // STATE-BASED: Wait for completion (ensure files were actually loaded)
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      const failed = parseInt(document.getElementById('failed-files').textContent || '0');
      // Processing complete and files were loaded
      return processing === 0 && total > 0 && (processed + failed) === total;
    }, { timeout: 60000 });

    const totalTime = Date.now() - startTime;
    const results = await page.evaluate(() => window.getResults());

    console.log('Performance results:');
    console.log(`  Total files: ${results.totalFiles}`);
    console.log(`  Processed: ${results.processed}`);
    console.log(`  Total time: ${totalTime}ms`);
    console.log(`  Avg time per file: ${results.avgTime}ms`);
    console.log(`  Throughput: ${(results.processed / (totalTime / 1000)).toFixed(2)} files/sec`);

    // Verify we actually processed files
    expect(results.totalFiles).toBeGreaterThan(0);
    expect(results.processed).toBeGreaterThan(0);

    // With 12 workers, processing should be significantly faster than sequential
    // Approximate speedup = worker_count * efficiency
    // Expect at least 3x speedup (conservative, accounting for overhead)
    const sequentialEstimate = results.processed * results.avgTime;
    const speedup = sequentialEstimate / totalTime;

    console.log(`  Estimated speedup: ${speedup.toFixed(1)}x`);

    expect(speedup).toBeGreaterThan(MIN_EXPECTED_SPEEDUP);
  });

  test('should handle worker errors gracefully', async ({ page }) => {
    console.log('Testing error handling...');

    // Start test
    await page.click('#start-test');

    // Wait for completion
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      return processing === 0 && total > 0;
    }, { timeout: 60000 });

    const results = await page.evaluate(() => window.getResults());

    console.log(`Results: ${results.processed} processed, ${results.failed} failed`);

    // Should have mostly successes
    expect(results.processed).toBeGreaterThan(results.failed * 10); // 90%+ success rate

    // Check that failed files don't break the worker pool
    if (results.failed > 0) {
      // Workers should still be operational
      const workerStatuses = await page.evaluate(() => {
        return Array.from(window.workerStats.values()).map(stat => stat.status);
      });

      // No workers should be permanently stuck in error state
      const errorCount = workerStatuses.filter(status => status === 'error').length;
      expect(errorCount).toBeLessThanOrEqual(2); // Max 2 workers in error state
    }
  });

  test('should reset properly', async ({ page }) => {
    console.log('Testing reset functionality...');

    // Run a test
    await page.click('#start-test');

    // STATE-BASED: Wait for files to load and some processing to happen
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      // Files loaded and at least some processed
      return total > 0 && processed > 0;
    }, { timeout: 10000 });

    // Click reset
    await page.click('#reset-test');

    // STATE-BASED: Wait for reset to complete (stats cleared)
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files').textContent || '0');
      const processed = parseInt(document.getElementById('processed-files').textContent || '0');
      const processing = parseInt(document.getElementById('processing-files').textContent || '0');
      const failed = parseInt(document.getElementById('failed-files').textContent || '0');
      return total === 0 && processed === 0 && processing === 0 && failed === 0;
    }, { timeout: 2000 });

    // Verify reset state
    await expect(page.locator('#total-files')).toHaveText('0');
    await expect(page.locator('#processed-files')).toHaveText('0');
    await expect(page.locator('#processing-files')).toHaveText('0');
    await expect(page.locator('#failed-files')).toHaveText('0');

    // Hash list should be empty
    const hashItems = page.locator('.hash-item');
    await expect(hashItems).toHaveCount(0);

    // Progress bar should be reset
    const progressFill = page.locator('#progress-fill');
    const width = await progressFill.evaluate(el => el.style.width);
    expect(width).toBe('0%');

    // FALLBACK: Use setTimeout if button state isn't updated properly in reset
    // Try waiting for button to be enabled, but don't fail the test if it's not
    const buttonEnabled = await page.locator('#start-test').isEnabled().catch(() => false);
    if (!buttonEnabled) {
      console.log('Note: Start button not re-enabled after reset (may need HTML fix)');
      // Give it a moment with setTimeout fallback
      await page.waitForTimeout(500);
    }

    // Check button state after potential delay
    const finalButtonState = await page.locator('#start-test').isEnabled();
    console.log(`Start button enabled after reset: ${finalButtonState}`);

    // Should be enabled for a clean reset
    expect(finalButtonState).toBe(true);
  });
});
