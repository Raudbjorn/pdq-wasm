#!/usr/bin/env node

/**
 * Basic smoke test for PDQ WASM module
 * Tests that the module loads and basic functions work
 */

const createPDQModule = require('../wasm/pdq.js');
const path = require('path');
const fs = require('fs');

async function runTest() {
  console.log('Loading PDQ WASM module...');

  // In Node.js, read WASM file and provide as binary to avoid URL issues
  const wasmPath = path.join(__dirname, '..', 'wasm', 'pdq.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);

  const Module = await createPDQModule({ wasmBinary });
  console.log('✓ Module loaded successfully');

  // Access the memory buffer through exported heap arrays

  // Test malloc/free
  console.log('\nTesting memory allocation...');
  const testPtr = Module._malloc(32);
  if (testPtr === 0) {
    throw new Error('malloc failed');
  }
  console.log(`✓ malloc(32) = ${testPtr}`);
  Module._free(testPtr);
  console.log('✓ free() succeeded');

  // Test hashing with a simple grayscale image (10x10, all white)
  console.log('\nTesting PDQ hash from grayscale...');
  const width = 10;
  const height = 10;
  const imageSize = width * height;

  // Create test image (all white pixels = 255)
  const imagePtr = Module._malloc(imageSize);
  const hashPtr = Module._malloc(32);
  const qualityPtr = Module._malloc(4);

  // Fill image with white pixels using proper heap access
  const imageArray = new Uint8Array(imageSize);
  imageArray.fill(255);
  Module.HEAPU8.set(imageArray, imagePtr);

  const result = Module._pdq_hash_from_gray(
    imagePtr,
    width,
    height,
    hashPtr,
    qualityPtr
  );

  if (result !== 0) {
    throw new Error(`pdq_hash_from_gray failed with code ${result}`);
  }
  console.log('✓ pdq_hash_from_gray succeeded');

  // Read the hash
  const hash = new Uint8Array(Module.HEAPU8.slice(hashPtr, hashPtr + 32));
  const quality = Module.HEAP32[qualityPtr >> 2];

  console.log(`✓ Quality: ${quality}`);
  console.log(`✓ Hash (first 8 bytes): ${Array.from(hash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}`);

  // Test hash to hex conversion
  console.log('\nTesting hash to hex conversion...');
  const hexPtr = Module._malloc(65);
  Module._pdq_hash_to_hex(hashPtr, hexPtr);

  let hexStr = '';
  for (let i = 0; i < 64; i++) {
    hexStr += String.fromCharCode(Module.HEAPU8[hexPtr + i]);
  }
  console.log(`✓ Hex hash: ${hexStr}`);

  // Test Hamming distance (same hash should give 0)
  console.log('\nTesting Hamming distance...');
  const distance = Module._pdq_hamming_distance(hashPtr, hashPtr);
  if (distance !== 0) {
    throw new Error(`Expected distance 0 for identical hashes, got ${distance}`);
  }
  console.log(`✓ Hamming distance (same hash): ${distance}`);

  // Test with a different image (all black)
  console.log('\nTesting with different image (all black)...');
  const imagePtr2 = Module._malloc(imageSize);
  const hashPtr2 = Module._malloc(32);
  const qualityPtr2 = Module._malloc(4);

  const imageArray2 = new Uint8Array(imageSize);
  imageArray2.fill(0); // all black
  Module.HEAPU8.set(imageArray2, imagePtr2);

  const result2 = Module._pdq_hash_from_gray(
    imagePtr2,
    width,
    height,
    hashPtr2,
    qualityPtr2
  );

  if (result2 !== 0) {
    throw new Error(`pdq_hash_from_gray failed with code ${result2}`);
  }

  const distance2 = Module._pdq_hamming_distance(hashPtr, hashPtr2);
  console.log(`✓ Hamming distance (white vs black): ${distance2}`);
  if (distance2 === 0) {
    throw new Error('Expected non-zero distance for different images');
  }

  // Cleanup
  Module._free(imagePtr);
  Module._free(hashPtr);
  Module._free(qualityPtr);
  Module._free(hexPtr);
  Module._free(imagePtr2);
  Module._free(hashPtr2);
  Module._free(qualityPtr2);

  console.log('\n✓ All basic tests passed!');
  console.log('\nThe PDQ WASM module is working correctly.');
  console.log('Next steps:');
  console.log('  - Build TypeScript wrapper');
  console.log('  - Implement full test suite');
  console.log('  - Test with real images');
}

runTest().catch(err => {
  console.error('\n✗ Test failed:', err);
  process.exit(1);
});
