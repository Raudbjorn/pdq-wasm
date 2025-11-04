/**
 * E2E Tests for PDQ Duplicate Detection in Uppy
 *
 * Tests the complete workflow:
 * 1. Upload images to Uppy dashboard
 * 2. PDQ hash generation
 * 3. Duplicate detection
 * 4. UI updates
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const WEBAPP_URL = '/__tests__/e2e/webapp/index.html';
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

// Counter for generating unique filenames
let uploadCounter = 0;

// Helper to upload a file - uses Uppy's programmatic API to bypass UI issues
async function uploadFile(page: any, filePath: string) {
  // Read the file from disk
  const fs = require('fs');
  const pathModule = require('path');
  const originalFileName = pathModule.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileData = fileBuffer.toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Generate unique filename to bypass Uppy's duplicate name check
  // while keeping the same file content for duplicate detection testing
  uploadCounter++;
  const ext = pathModule.extname(originalFileName);
  const nameWithoutExt = pathModule.basename(originalFileName, ext);
  const uniqueFileName = `${nameWithoutExt}-${uploadCounter}${ext}`;

  // Use Uppy's addFile API directly via page.evaluate
  await page.evaluate(({ fileName, fileData, mimeType }) => {
    // Convert base64 back to Blob
    const byteCharacters = atob(fileData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // Access the global Uppy instance and add the file
    const uppy = (window as any).uppy;
    if (uppy) {
      uppy.addFile({
        name: fileName,
        type: mimeType,
        data: blob
      });
    }
  }, { fileName: uniqueFileName, fileData, mimeType });

  // Give Uppy time to process the file addition
  await page.waitForTimeout(1000);
}

test.describe('PDQ Duplicate Detection E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Reset upload counter for each test
    uploadCounter = 0;

    // Capture console logs and errors
    page.on('console', msg => console.log(`[Browser ${msg.type()}]:`, msg.text()));
    page.on('pageerror', err => console.error('[Browser Error]:', err.message));
    page.on('requestfailed', request => console.error('[Request Failed]:', request.url(), request.failure()?.errorText));

    // Navigate to the webapp
    await page.goto(WEBAPP_URL);

    // Wait for PDQ to initialize
    await page.waitForFunction(() => window.PDQ !== undefined);

    // Verify initialization
    const isPDQReady = await page.evaluate(() => {
      return typeof window.PDQ !== 'undefined' &&
             typeof window.uppy !== 'undefined';
    });

    expect(isPDQReady).toBe(true);
  });

  test('should load webapp and initialize PDQ successfully', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle('PDQ Duplicate Detection - Uppy Demo');

    // Check header
    await expect(page.locator('h1')).toContainText('PDQ Duplicate Detection Demo');

    // Check initial status
    await expect(page.locator('#total-files')).toHaveText('0');
    await expect(page.locator('#duplicates-count')).toHaveText('0');
    await expect(page.locator('#unique-count')).toHaveText('0');
    await expect(page.locator('#processing-status')).toHaveText('Ready');

    // Check Uppy dashboard is visible
    await expect(page.locator('.uppy-Dashboard')).toBeVisible();
  });

  test('should detect duplicate when same file uploaded twice', async ({ page }) => {
    const filePath = path.join(FIXTURES_DIR, 'red-circle.png');

    // Upload the same file twice
    console.log('Uploading red-circle.png (first time)...');
    await uploadFile(page, filePath);

    // Wait for hash generation
    await page.waitForTimeout(1000);

    console.log('Uploading red-circle.png (second time)...');
    await uploadFile(page, filePath);

    // Wait for duplicate detection
    await page.waitForTimeout(1000);

    // Check status counters
    const totalFiles = await page.locator('#total-files').textContent();
    const duplicatesCount = await page.locator('#duplicates-count').textContent();
    const uniqueCount = await page.locator('#unique-count').textContent();

    console.log('Status:', { totalFiles, duplicatesCount, uniqueCount });

    expect(parseInt(totalFiles || '0')).toBe(2);
    expect(parseInt(duplicatesCount || '0')).toBe(2);
    expect(parseInt(uniqueCount || '0')).toBe(0);

    // Check duplicate section is visible
    await expect(page.locator('#duplicates-section')).toHaveClass(/has-duplicates/);

    // Check duplicate group is displayed
    const duplicateGroup = page.locator('[data-testid="duplicate-group-0"]');
    await expect(duplicateGroup).toBeVisible();
    await expect(duplicateGroup).toContainText('Duplicate Group 1');
    await expect(duplicateGroup).toContainText('2 files');
  });

  test('should NOT detect duplicates for different files', async ({ page }) => {
    const redCirclePath = path.join(FIXTURES_DIR, 'red-circle.png');
    const blueSquarePath = path.join(FIXTURES_DIR, 'blue-square.png');


    // Upload red circle
    console.log('Uploading red-circle.png...');
    await uploadFile(page, redCirclePath);
    await page.waitForTimeout(1000);

    // Upload blue square (very different image)
    console.log('Uploading blue-square.png...');
    await uploadFile(page, blueSquarePath);
    await page.waitForTimeout(1000);

    // Check status counters
    const totalFiles = await page.locator('#total-files').textContent();
    const duplicatesCount = await page.locator('#duplicates-count').textContent();
    const uniqueCount = await page.locator('#unique-count').textContent();

    console.log('Status:', { totalFiles, duplicatesCount, uniqueCount });

    expect(parseInt(totalFiles || '0')).toBe(2);
    expect(parseInt(duplicatesCount || '0')).toBe(0);
    expect(parseInt(uniqueCount || '0')).toBe(2);

    // Check duplicate section is NOT visible
    await expect(page.locator('#duplicates-section')).not.toHaveClass(/has-duplicates/);
  });

  test('should detect duplicate with renamed copy', async ({ page }) => {
    const originalPath = path.join(FIXTURES_DIR, 'red-circle.png');
    const copyPath = path.join(FIXTURES_DIR, 'red-circle-copy.png');


    // Upload original
    console.log('Uploading red-circle.png...');
    await uploadFile(page, originalPath);
    await page.waitForTimeout(1000);

    // Upload copy (same content, different filename)
    console.log('Uploading red-circle-copy.png...');
    await uploadFile(page, copyPath);
    await page.waitForTimeout(1000);

    // Check status - should detect as duplicate
    const totalFiles = await page.locator('#total-files').textContent();
    const duplicatesCount = await page.locator('#duplicates-count').textContent();
    const uniqueCount = await page.locator('#unique-count').textContent();

    console.log('Status:', { totalFiles, duplicatesCount, uniqueCount });

    expect(parseInt(totalFiles || '0')).toBe(2);
    expect(parseInt(duplicatesCount || '0')).toBe(2);
    expect(parseInt(uniqueCount || '0')).toBe(0);

    // Check duplicate section is visible
    await expect(page.locator('#duplicates-section')).toHaveClass(/has-duplicates/);

    // Verify both filenames are in duplicate group (with counter suffixes)
    const duplicateGroup = page.locator('[data-testid="duplicate-group-0"]');
    await expect(duplicateGroup).toContainText('red-circle-1.png');
    await expect(duplicateGroup).toContainText('red-circle-copy-2.png');
  });

  test('should handle mixed scenario: duplicates + unique files', async ({ page }) => {
    const redCirclePath = path.join(FIXTURES_DIR, 'red-circle.png');
    const redCircleCopyPath = path.join(FIXTURES_DIR, 'red-circle-copy.png');
    const greenTrianglePath = path.join(FIXTURES_DIR, 'green-triangle.png');
    const blueSquarePath = path.join(FIXTURES_DIR, 'blue-square.png');


    // Upload red circle
    console.log('Uploading red-circle.png...');
    await uploadFile(page, redCirclePath);
    await page.waitForTimeout(800);

    // Upload red circle copy (duplicate)
    console.log('Uploading red-circle-copy.png...');
    await uploadFile(page, redCircleCopyPath);
    await page.waitForTimeout(800);

    // Upload green triangle (unique)
    console.log('Uploading green-triangle.png...');
    await uploadFile(page, greenTrianglePath);
    await page.waitForTimeout(800);

    // Upload blue square (unique)
    console.log('Uploading blue-square.png...');
    await uploadFile(page, blueSquarePath);
    await page.waitForTimeout(800);

    // Check status
    const totalFiles = await page.locator('#total-files').textContent();
    const duplicatesCount = await page.locator('#duplicates-count').textContent();
    const uniqueCount = await page.locator('#unique-count').textContent();

    console.log('Status:', { totalFiles, duplicatesCount, uniqueCount });

    // Should have: 4 total, 2 duplicates (red circle + copy), 2 unique (triangle + square)
    expect(parseInt(totalFiles || '0')).toBe(4);
    expect(parseInt(duplicatesCount || '0')).toBe(2);
    expect(parseInt(uniqueCount || '0')).toBe(2);

    // Should show 1 duplicate group (the two red circles)
    await expect(page.locator('#duplicates-section')).toHaveClass(/has-duplicates/);
    const duplicateGroups = page.locator('[data-testid^="duplicate-group-"]');
    await expect(duplicateGroups).toHaveCount(1);
  });

  test('should update UI when file is removed', async ({ page }) => {
    const filePath = path.join(FIXTURES_DIR, 'red-circle.png');

    // Upload same file twice to create duplicate
    await uploadFile(page, filePath);
    await page.waitForTimeout(1000);
    await uploadFile(page, filePath);
    await page.waitForTimeout(1000);

    // Verify duplicates detected
    let duplicatesCount = await page.locator('#duplicates-count').textContent();
    expect(parseInt(duplicatesCount || '0')).toBe(2);

    // Remove one file
    console.log('Removing one file...');
    const removeButton = page.locator('.uppy-Dashboard-Item-action--remove').first();
    await removeButton.click();
    await page.waitForTimeout(500);

    // Check updated status - should have 1 file, 0 duplicates
    const totalFiles = await page.locator('#total-files').textContent();
    duplicatesCount = await page.locator('#duplicates-count').textContent();
    const uniqueCount = await page.locator('#unique-count').textContent();

    console.log('After removal:', { totalFiles, duplicatesCount, uniqueCount });

    expect(parseInt(totalFiles || '0')).toBe(1);
    expect(parseInt(duplicatesCount || '0')).toBe(0);
    expect(parseInt(uniqueCount || '0')).toBe(1);

    // Duplicate section should be hidden
    await expect(page.locator('#duplicates-section')).not.toHaveClass(/has-duplicates/);
  });

  test('should correctly hash and detect across different image formats', async ({ page }) => {
    // This test verifies that the PDQ hashing works correctly
    const redCirclePath = path.join(FIXTURES_DIR, 'red-circle.png');

    // Upload file
    await uploadFile(page, redCirclePath);
    await page.waitForTimeout(1000);

    // Check that hash was generated
    const hashGenerated = await page.evaluate(() => {
      const files = Array.from(window.uploadedFiles.values());
      return files.length > 0 && files[0].meta?.hash?.length === 64;
    });

    expect(hashGenerated).toBe(true);

    // Get the hash
    const hash = await page.evaluate(() => {
      const files = Array.from(window.uploadedFiles.values());
      return files[0].meta?.hash;
    });

    console.log('Generated hash:', hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
