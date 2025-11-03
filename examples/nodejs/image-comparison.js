#!/usr/bin/env node

/**
 * PDQ WASM - Image Comparison Example
 *
 * This example demonstrates how to:
 * - Load images from disk using Sharp
 * - Generate PDQ hashes for real images
 * - Compare multiple images to find similar ones
 *
 * Usage:
 *   node image-comparison.js <image1> <image2> [image3 ...]
 *
 * Example:
 *   node image-comparison.js photo1.jpg photo2.jpg photo3.jpg
 */

const { PDQ } = require('pdq-wasm');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function hashImageFile(filePath) {
  // Load image using Sharp
  const img = sharp(filePath);
  const metadata = await img.metadata();

  // Get raw pixel data
  const { data, info } = await img
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Generate PDQ hash
  const result = PDQ.hash({
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels
  });

  return {
    filePath,
    fileName: path.basename(filePath),
    width: info.width,
    height: info.height,
    channels: info.channels,
    hash: result.hash,
    hexHash: PDQ.toHex(result.hash),
    quality: result.quality
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node image-comparison.js <image1> <image2> [image3 ...]');
    console.error('');
    console.error('Example:');
    console.error('  node image-comparison.js photo1.jpg photo2.jpg photo3.jpg');
    console.error('');
    console.error('Note: Requires sharp package to be installed:');
    console.error('  npm install sharp');
    process.exit(1);
  }

  // Verify all files exist
  for (const file of args) {
    if (!fs.existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      process.exit(1);
    }
  }

  console.log('=== PDQ WASM - Image Comparison Example ===\n');

  // Initialize PDQ
  console.log('Initializing PDQ WASM module...');
  await PDQ.init();
  console.log('✓ Module initialized\n');

  // Hash all images
  console.log(`Hashing ${args.length} images...\n`);
  const hashedImages = [];

  for (const filePath of args) {
    try {
      console.log(`Processing: ${path.basename(filePath)}`);
      const result = await hashImageFile(filePath);
      hashedImages.push(result);
      console.log(`  Dimensions: ${result.width}x${result.height}`);
      console.log(`  Channels: ${result.channels}`);
      console.log(`  Quality: ${result.quality}`);
      console.log(`  Hash: ${result.hexHash}`);
      console.log('');
    } catch (err) {
      console.error(`  Error processing ${filePath}: ${err.message}`);
      console.log('');
    }
  }

  if (hashedImages.length < 2) {
    console.error('Need at least 2 successfully hashed images to compare.');
    process.exit(1);
  }

  // Compare all pairs
  console.log('=== Pairwise Comparisons ===\n');

  const threshold = 31; // PDQ recommended threshold for duplicates
  const similarPairs = [];

  for (let i = 0; i < hashedImages.length; i++) {
    for (let j = i + 1; j < hashedImages.length; j++) {
      const img1 = hashedImages[i];
      const img2 = hashedImages[j];

      const distance = PDQ.hammingDistance(img1.hash, img2.hash);
      const similarity = PDQ.similarity(img1.hash, img2.hash);
      const isSimilar = distance <= threshold;

      console.log(`${img1.fileName} ↔ ${img2.fileName}`);
      console.log(`  Distance: ${distance} / 256`);
      console.log(`  Similarity: ${similarity.toFixed(2)}%`);
      console.log(`  Similar? ${isSimilar ? '✓ YES' : '✗ NO'} (threshold: ${threshold})`);
      console.log('');

      if (isSimilar) {
        similarPairs.push({ img1, img2, distance, similarity });
      }
    }
  }

  // Summary
  console.log('=== Summary ===\n');
  console.log(`Total images: ${hashedImages.length}`);
  console.log(`Total comparisons: ${(hashedImages.length * (hashedImages.length - 1)) / 2}`);
  console.log(`Similar pairs (distance ≤ ${threshold}): ${similarPairs.length}`);

  if (similarPairs.length > 0) {
    console.log('\nSimilar image pairs:');
    for (const pair of similarPairs) {
      console.log(`  • ${pair.img1.fileName} ↔ ${pair.img2.fileName} (distance: ${pair.distance}, similarity: ${pair.similarity.toFixed(1)}%)`);
    }
  } else {
    console.log('\nNo similar images found with threshold of 31.');
  }

  console.log('');
}

// Run the example
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
