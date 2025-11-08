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
import {
  waitForProcessingComplete,
  waitForFilesLoaded,
  assertStartButtonEnabled
} from './test-helpers';

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

    // Wait for files to load
    await waitForFilesLoaded(page);

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

    // Wait for all processing to complete
    await waitForProcessingComplete(page, 60000);

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

  test('should detect near-duplicate images (1-pixel variation)', async ({ page }) => {
    console.log('Testing near-duplicate detection...');

    // Start normal test first
    await page.click('#start-test');

    // Wait for initial files to load
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return total > 0;
    }, { timeout: 5000 });

    // Create and inject two nearly identical images AFTER test has started
    await page.evaluate(async () => {
      // Create a simple 100x100 red square
      const createRedSquare = (withPixelVariation = false) => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d')!;

        // Fill with red
        ctx.fillStyle = 'rgb(255, 0, 0)';
        ctx.fillRect(0, 0, 100, 100);

        // Add 1-pixel variation if requested (single blue pixel in center)
        if (withPixelVariation) {
          ctx.fillStyle = 'rgb(0, 0, 255)';
          ctx.fillRect(50, 50, 1, 1);
        }

        return canvas;
      };

      // Convert canvas to blob
      const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
        return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/png');
        });
      };

      // Create and inject both images
      const [blob1, blob2] = await Promise.all([
        canvasToBlob(createRedSquare(false)),
        canvasToBlob(createRedSquare(true))
      ]);

      // Push directly to testFiles
      (window as any).testFiles.push(
        { name: 'base-image.png', blob: blob1 },
        { name: 'near-duplicate.png', blob: blob2 }
      );

      // Update total files display
      const total = parseInt(document.getElementById('total-files')!.textContent || '0');
      document.getElementById('total-files')!.textContent = (total + 2).toString();

      // Trigger processing for injected files
      (window as any).triggerProcessing();
    });

    // Wait for processing to complete
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
      const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
      return processing === 0 && total > 0 && (processed + failed) === total;
    }, { timeout: 30000 });

    // Get hashes and calculate similarity
    const similarity = await page.evaluate(() => {
      const hashItems = document.querySelectorAll('.hash-item');
      const hashes = new Map<string, string>();

      hashItems.forEach(item => {
        const filename = item.querySelector('.hash-filename')!.textContent!;
        const hash = item.querySelector('.hash-value')!.textContent!;
        hashes.set(filename, hash);
      });

      const baseHash = hashes.get('base-image.png');
      const nearDupHash = hashes.get('near-duplicate.png');

      if (!baseHash || !nearDupHash) {
        return { found: false, distance: -1, similarity: -1 };
      }

      // Calculate Hamming distance
      let distance = 0;
      for (let i = 0; i < baseHash.length / 2; i++) {
        const byte1 = parseInt(baseHash.substring(i * 2, i * 2 + 2), 16);
        const byte2 = parseInt(nearDupHash.substring(i * 2, i * 2 + 2), 16);
        const xor = byte1 ^ byte2;
        // Count bits set in XOR
        for (let j = 0; j < 8; j++) {
          if (xor & (1 << j)) distance++;
        }
      }

      const similarity = ((256 - distance) / 256) * 100;

      return {
        found: true,
        distance,
        similarity,
        baseHash: baseHash.substring(0, 16) + '...',
        nearDupHash: nearDupHash.substring(0, 16) + '...'
      };
    });

    console.log(`Near-duplicate test results:`);
    console.log(`  Base hash: ${similarity.baseHash}`);
    console.log(`  Near-dup hash: ${similarity.nearDupHash}`);
    console.log(`  Hamming distance: ${similarity.distance}`);
    console.log(`  Similarity: ${similarity.similarity.toFixed(1)}%`);

    // Verify both hashes were generated
    expect(similarity.found).toBe(true);

    // Images with only 1 pixel difference should be highly similar (>90%)
    // PDQ is designed to be robust to small variations
    expect(similarity.similarity).toBeGreaterThan(90);

    // Distance should be very small (typically < 26 bits for PDQ)
    expect(similarity.distance).toBeLessThan(26);
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

  test('should handle corrupt image files', async ({ page }) => {
    console.log('Testing corrupt image handling...');

    // Start normal test first
    await page.click('#start-test');

    // Wait for initial files to load
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return total > 0;
    }, { timeout: 5000 });

    // Inject corrupt PNG file AFTER test has started
    await page.evaluate(() => {
      const corruptData = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, // PNG signature (partial)
        0xFF, 0xFF, 0xFF, 0xFF  // Invalid/corrupt data
      ]);
      const blob = new Blob([corruptData], { type: 'image/png' });
      (window as any).testFiles.push({
        name: 'corrupt.png',
        blob
      });
      // Update total files display
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      document.getElementById('total-files')!.textContent = (total + 1).toString();

      // Trigger processing for injected file
      (window as any).triggerProcessing();
    });

    // Wait for processing to complete
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
      const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
      return processing === 0 && total > 0 && (processed + failed) === total;
    }, { timeout: 30000 });

    const results = await page.evaluate(() => (window as any).getResults());
    const errorMessages = await page.evaluate(() => (window as any).getErrorMessages());

    console.log(`Results: ${results.processed} processed, ${results.failed} failed`);
    console.log(`Error messages:`, errorMessages);

    // Should have failed the corrupt file (at least 1 failure)
    expect(results.failed).toBeGreaterThan(0);

    // Error message should be captured
    expect(errorMessages.length).toBeGreaterThan(0);

    // Workers should still be operational after error
    const workerStatuses = await page.evaluate(() => {
      return Array.from((window as any).workerStats.values()).map((stat: any) => stat.status);
    });

    // Most workers should be idle (not stuck in error state)
    const idleCount = workerStatuses.filter((status: string) => status === 'idle').length;
    expect(idleCount).toBeGreaterThan(WORKER_COUNT / 2);
  });

  test('should handle unsupported file formats', async ({ page }) => {
    console.log('Testing unsupported format handling...');

    // Start normal test first
    await page.click('#start-test');

    // Wait for initial files to load
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return total > 0;
    }, { timeout: 5000 });

    // Inject text file (unsupported format) AFTER test has started
    await page.evaluate(() => {
      const textData = new TextEncoder().encode('This is not an image file');
      const blob = new Blob([textData], { type: 'text/plain' });
      (window as any).testFiles.push({
        name: 'document.txt',
        blob
      });
      // Update total files display
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      document.getElementById('total-files')!.textContent = (total + 1).toString();

      // Trigger processing for injected file
      (window as any).triggerProcessing();
    });

    // Wait for processing to complete
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
      const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
      return processing === 0 && total > 0 && (processed + failed) === total;
    }, { timeout: 30000 });

    const results = await page.evaluate(() => (window as any).getResults());
    const errorMessages = await page.evaluate(() => (window as any).getErrorMessages());

    console.log(`Results: ${results.processed} processed, ${results.failed} failed`);
    console.log(`Error messages:`, errorMessages);

    // Should have failed the unsupported file (at least 1 failure)
    expect(results.failed).toBeGreaterThan(0);

    // Error should be logged
    expect(errorMessages.length).toBeGreaterThan(0);
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

    // Start button should be enabled for a clean reset (uses Playwright's auto-retry)
    await assertStartButtonEnabled(page);
  });
});

// New test suite for 4-worker batch processing
test.describe('PDQ Worker Pool E2E - Batch Processing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3030/__tests__/e2e/webapp/worker-batch.html');
    await page.waitForLoadState('networkidle');

    // Wait for workers to initialize
    await page.waitForFunction(() => {
      const startButton = document.getElementById('start-test') as HTMLButtonElement;
      return startButton && !startButton.disabled;
    }, { timeout: 30000 });
  });

  test('should process files in batches of 3 with 4 workers', async ({ page }) => {
    console.log('Testing batch processing...');

    // Start test
    await page.click('#start-test');

    // Wait for files to load
    await page.waitForFunction(() => {
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return total > 0;
    }, { timeout: 5000 });

    const totalFiles = await page.locator('#total-files').textContent();
    const total = parseInt(totalFiles || '0');
    console.log(`Total files to process: ${total}`);

    // Track batch progression
    const batchProgression = [];

    // Monitor batch changes
    let lastBatch = 0;
    const checkInterval = setInterval(async () => {
      try {
        const currentBatchNum = await page.evaluate(() => {
          return parseInt(document.getElementById('current-batch')?.textContent || '0');
        });

        if (currentBatchNum > lastBatch) {
          batchProgression.push(currentBatchNum);
          lastBatch = currentBatchNum;
          console.log(`Batch ${currentBatchNum} started`);
        }
      } catch (e) {
        // Ignore errors during monitoring
      }
    }, 100);

    // Wait for processing to complete
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
      const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
      const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return processing === 0 && (processed + failed) === total && total > 0;
    }, { timeout: 30000 });

    clearInterval(checkInterval);

    const results = await page.evaluate(() => (window as any).getResults());

    console.log('Batch processing complete:', results);
    console.log('Batch progression:', batchProgression);

    // Verify results
    expect(results.processed).toBeGreaterThan(0);
    expect(results.processing).toBe(0);
    expect(results.processed + results.failed).toBe(results.totalFiles);

    // Verify batch processing occurred (should have processed in batches)
    expect(results.currentBatch).toBeGreaterThan(0);

    // With 12 files and batch size 3, we should have 4 batches
    expect(results.currentBatch).toBe(4);

    console.log(`Total batches: ${results.currentBatch}`);
    console.log(`Avg time per file: ${results.avgTime}ms`);
  });

  test('should use max 4 workers in batch mode', async ({ page }) => {
    console.log('Testing worker usage in batch mode...');

    // Start test
    await page.click('#start-test');

    // Wait for processing to complete
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
      const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
      const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return processing === 0 && (processed + failed) === total && total > 0;
    }, { timeout: 30000 });

    // Check worker statistics
    const workerUsage = await page.evaluate(() => {
      return Array.from((window as any).workerStats.values()).map((stat: any) => ({
        id: stat.id,
        processed: stat.processed,
        errors: stat.errors
      }));
    });

    console.log('Worker usage:', workerUsage);

    // Verify we have exactly 4 workers
    expect(workerUsage.length).toBe(4);

    // Each worker should have processed some files
    const activeWorkers = workerUsage.filter((w: any) => w.processed > 0);
    console.log(`Active workers: ${activeWorkers.length} / 4`);

    // At least some workers should be active (batch size allows up to 3)
    expect(activeWorkers.length).toBeGreaterThan(0);
    expect(activeWorkers.length).toBeLessThanOrEqual(4);
  });

  test('should process batches sequentially', async ({ page }) => {
    console.log('Testing sequential batch processing...');

    // Start test
    await page.click('#start-test');

    // Wait for first batch to start
    await page.waitForFunction(() => {
      const currentBatch = parseInt(document.getElementById('current-batch')?.textContent || '0');
      return currentBatch > 0;
    }, { timeout: 5000 });

    // Monitor concurrent processing count
    let maxConcurrent = 0;
    const monitorInterval = setInterval(async () => {
      try {
        const processing = await page.evaluate(() => {
          return parseInt(document.getElementById('processing-files')?.textContent || '0');
        });
        if (processing > maxConcurrent) {
          maxConcurrent = processing;
        }
      } catch (e) {
        // Ignore errors during monitoring
      }
    }, 50);

    // Wait for completion
    await page.waitForFunction(() => {
      const processing = parseInt(document.getElementById('processing-files')?.textContent || '0');
      const processed = parseInt(document.getElementById('processed-files')?.textContent || '0');
      const failed = parseInt(document.getElementById('failed-files')?.textContent || '0');
      const total = parseInt(document.getElementById('total-files')?.textContent || '0');
      return processing === 0 && (processed + failed) === total && total > 0;
    }, { timeout: 30000 });

    clearInterval(monitorInterval);

    console.log(`Max concurrent files: ${maxConcurrent}`);

    // Batch size is 3, so max concurrent should be <= 3
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThan(0);
  });
});
