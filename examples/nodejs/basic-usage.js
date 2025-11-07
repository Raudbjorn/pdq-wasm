#!/usr/bin/env node

/**
 * PDQ WASM - Node.js Basic Usage Example
 *
 * This example demonstrates basic PDQ hashing operations in Node.js
 */

const { PDQ } = require('pdq-wasm');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('=== PDQ WASM - Node.js Basic Usage Example ===\n');

  // Step 1: Initialize the WASM module
  console.log('1. Initializing PDQ WASM module...');
  await PDQ.init();
  console.log('   ✓ Module initialized\n');

  // Step 2: Generate hash from a simple synthetic image
  console.log('2. Generating hash from synthetic image...');
  const width = 64;
  const height = 64;

  // Create a simple gradient image (grayscale)
  const imageData = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      imageData[y * width + x] = Math.floor((x / width) * 255);
    }
  }

  const result = PDQ.hash({
    data: imageData,
    width: width,
    height: height,
    channels: 1 // grayscale
  });

  console.log(`   Image: ${width}x${height} grayscale gradient`);
  console.log(`   Quality: ${result.quality}`);
  console.log(`   Hash (hex): ${PDQ.toHex(result.hash)}`);
  console.log(`   Hash (first 8 bytes): ${Array.from(result.hash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')}\n`);

  // Step 3: Generate hash from another image (inverted gradient)
  console.log('3. Generating hash from inverted image...');
  const imageData2 = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      imageData2[y * width + x] = 255 - Math.floor((x / width) * 255);
    }
  }

  const result2 = PDQ.hash({
    data: imageData2,
    width: width,
    height: height,
    channels: 1
  });

  console.log(`   Image: ${width}x${height} grayscale gradient (inverted)`);
  console.log(`   Quality: ${result2.quality}`);
  console.log(`   Hash (hex): ${PDQ.toHex(result2.hash)}\n`);

  // Step 4: Compare the two hashes
  console.log('4. Comparing hashes...');
  const distance = PDQ.hammingDistance(result.hash, result2.hash);
  const similarity = PDQ.similarity(result.hash, result2.hash);
  const isSimilar = PDQ.areSimilar(result.hash, result2.hash);

  console.log(`   Hamming distance: ${distance} / 256`);
  console.log(`   Similarity: ${similarity.toFixed(2)}%`);
  console.log(`   Similar (threshold=31)? ${isSimilar ? 'Yes' : 'No'}\n`);

  // Step 5: Demonstrate hex conversion
  console.log('5. Hash format conversion...');
  const hexString = PDQ.toHex(result.hash);
  const hashFromHex = PDQ.fromHex(hexString);
  const distanceAfterConversion = PDQ.hammingDistance(result.hash, hashFromHex);

  console.log(`   Original hash → hex → hash roundtrip`);
  console.log(`   Distance after roundtrip: ${distanceAfterConversion} (should be 0)`);
  console.log(`   ✓ Conversion successful\n`);

  // Step 6: Demonstrate RGB image hashing
  console.log('6. RGB image hashing...');
  const rgbWidth = 32;
  const rgbHeight = 32;
  const rgbData = new Uint8Array(rgbWidth * rgbHeight * 3);

  // Create a simple RGB pattern (red gradient)
  for (let y = 0; y < rgbHeight; y++) {
    for (let x = 0; x < rgbWidth; x++) {
      const idx = (y * rgbWidth + x) * 3;
      rgbData[idx] = Math.floor((x / rgbWidth) * 255);     // R
      rgbData[idx + 1] = 0;                                 // G
      rgbData[idx + 2] = 0;                                 // B
    }
  }

  const rgbResult = PDQ.hash({
    data: rgbData,
    width: rgbWidth,
    height: rgbHeight,
    channels: 3
  });

  console.log(`   Image: ${rgbWidth}x${rgbHeight} RGB`);
  console.log(`   Quality: ${rgbResult.quality}`);
  console.log(`   Hash (hex): ${PDQ.toHex(rgbResult.hash)}\n`);

  console.log('=== Example Complete ===');
}

// Run the example
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
