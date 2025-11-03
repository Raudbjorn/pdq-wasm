/**
 * PDQ (Perceptual Hash) WebAssembly bindings
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates (original algorithm)
 * Copyright (c) 2025 (WebAssembly bindings)
 */

import type {
  PDQHash,
  PDQHashResult,
  ImageData,
  PDQWasmModule,
  PDQOptions,
  SimilarityMatch,
} from './types';

// Import the WASM module factory
// This will be resolved differently in Node.js vs browser
let createPDQModuleFactory: any;

if (typeof process !== 'undefined' && process.versions?.node) {
  // Node.js environment
  try {
    createPDQModuleFactory = require('../wasm/pdq.js');
  } catch (e) {
    // WASM module not built yet
    createPDQModuleFactory = null;
  }
} else {
  // Browser environment - will need to be provided via options
  createPDQModuleFactory = null;
}

/**
 * PDQ WebAssembly implementation
 */
export class PDQ {
  private static module: PDQWasmModule | null = null;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initialize the WASM module
   * Must be called before using any PDQ functions
   */
  static async init(options: PDQOptions = {}): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (!createPDQModuleFactory) {
        throw new Error(
          'PDQ WASM module not available. Make sure to run: npm run build:wasm'
        );
      }

      this.module = await createPDQModuleFactory(options);
    })();

    return this.initPromise;
  }

  /**
   * Ensure the module is initialized
   */
  private static ensureInit(): PDQWasmModule {
    if (!this.module) {
      throw new Error('PDQ module not initialized. Call PDQ.init() first.');
    }
    return this.module;
  }

  /**
   * Hash image data and return PDQ hash with quality score
   *
   * @param imageData Image pixel data (RGB or grayscale)
   * @returns PDQ hash and quality score
   */
  static hash(imageData: ImageData): PDQHashResult {
    const mod = this.ensureInit();

    // Validate input
    const expectedSize = imageData.width * imageData.height * imageData.channels;
    if (imageData.data.length !== expectedSize) {
      throw new Error(
        `Invalid image data size. Expected ${expectedSize} bytes, got ${imageData.data.length}`
      );
    }

    // Allocate memory in WASM
    const imagePtr = mod._malloc(imageData.data.length);
    const hashPtr = mod._malloc(32); // 256 bits = 32 bytes
    const qualityPtr = mod._malloc(4); // int32

    try {
      // Copy image data to WASM memory
      mod.HEAPU8.set(imageData.data, imagePtr);

      let result: number;

      if (imageData.channels === 3) {
        // RGB image
        result = mod._pdq_hash_from_rgb(
          imagePtr,
          imageData.width,
          imageData.height,
          hashPtr,
          qualityPtr
        );
      } else {
        // Grayscale image
        result = mod._pdq_hash_from_gray(
          imagePtr,
          imageData.width,
          imageData.height,
          hashPtr,
          qualityPtr
        );
      }

      if (result !== 0) {
        throw new Error(`PDQ hashing failed with code: ${result}`);
      }

      // Read results from WASM memory
      const hash = new Uint8Array(32);
      hash.set(mod.HEAPU8.subarray(hashPtr, hashPtr + 32));
      const quality = mod.HEAP32[qualityPtr >> 2];

      return { hash, quality };
    } finally {
      // Free WASM memory
      mod._free(imagePtr);
      mod._free(hashPtr);
      mod._free(qualityPtr);
    }
  }

  /**
   * Calculate Hamming distance between two PDQ hashes
   * Returns a value from 0 (identical) to 256 (completely different)
   *
   * @param hash1 First PDQ hash
   * @param hash2 Second PDQ hash
   * @returns Hamming distance (0-256)
   */
  static hammingDistance(hash1: PDQHash, hash2: PDQHash): number {
    const mod = this.ensureInit();

    if (hash1.length !== 32 || hash2.length !== 32) {
      throw new Error('Invalid hash length. PDQ hashes must be 32 bytes.');
    }

    const hash1Ptr = mod._malloc(32);
    const hash2Ptr = mod._malloc(32);

    try {
      mod.HEAPU8.set(hash1, hash1Ptr);
      mod.HEAPU8.set(hash2, hash2Ptr);

      const distance = mod._pdq_hamming_distance(hash1Ptr, hash2Ptr);

      if (distance < 0) {
        throw new Error('Failed to calculate Hamming distance');
      }

      return distance;
    } finally {
      mod._free(hash1Ptr);
      mod._free(hash2Ptr);
    }
  }

  /**
   * Convert a PDQ hash to hexadecimal string representation
   *
   * @param hash PDQ hash bytes
   * @returns Hexadecimal string (64 characters)
   */
  static toHex(hash: PDQHash): string {
    const mod = this.ensureInit();

    if (hash.length !== 32) {
      throw new Error('Invalid hash length. PDQ hashes must be 32 bytes.');
    }

    const hashPtr = mod._malloc(32);
    const hexPtr = mod._malloc(65); // 64 chars + null terminator

    try {
      mod.HEAPU8.set(hash, hashPtr);
      mod._pdq_hash_to_hex(hashPtr, hexPtr);

      // Read hex string from WASM memory
      let hex = '';
      for (let i = 0; i < 64; i++) {
        hex += String.fromCharCode(mod.HEAPU8[hexPtr + i]);
      }

      return hex;
    } finally {
      mod._free(hashPtr);
      mod._free(hexPtr);
    }
  }

  /**
   * Convert a hexadecimal string to PDQ hash bytes
   *
   * @param hex Hexadecimal string (64 characters)
   * @returns PDQ hash bytes
   */
  static fromHex(hex: string): PDQHash {
    const mod = this.ensureInit();

    if (hex.length !== 64) {
      throw new Error('Invalid hex string length. Must be 64 characters.');
    }

    const hexPtr = mod._malloc(65);
    const hashPtr = mod._malloc(32);

    try {
      // Copy hex string to WASM memory
      for (let i = 0; i < 64; i++) {
        mod.HEAPU8[hexPtr + i] = hex.charCodeAt(i);
      }
      mod.HEAPU8[hexPtr + 64] = 0; // null terminator

      const result = mod._pdq_hex_to_hash(hexPtr, hashPtr);

      if (result !== 0) {
        throw new Error('Invalid hex string format');
      }

      const hash = new Uint8Array(32);
      hash.set(mod.HEAPU8.subarray(hashPtr, hashPtr + 32));

      return hash;
    } finally {
      mod._free(hexPtr);
      mod._free(hashPtr);
    }
  }

  /**
   * Check if two hashes are similar based on a threshold
   *
   * @param hash1 First PDQ hash
   * @param hash2 Second PDQ hash
   * @param threshold Maximum Hamming distance to consider similar (default: 31)
   * @returns True if hashes are similar
   */
  static areSimilar(
    hash1: PDQHash,
    hash2: PDQHash,
    threshold: number = 31
  ): boolean {
    const distance = this.hammingDistance(hash1, hash2);
    return distance <= threshold;
  }

  /**
   * Get similarity percentage between two hashes (0-100)
   *
   * @param hash1 First PDQ hash
   * @param hash2 Second PDQ hash
   * @returns Similarity percentage (0 = completely different, 100 = identical)
   */
  static similarity(hash1: PDQHash, hash2: PDQHash): number {
    const distance = this.hammingDistance(hash1, hash2);
    return ((256 - distance) / 256) * 100;
  }

  /**
   * Order an array of hashes by similarity to a reference hash
   * Returns hashes sorted from most similar to least similar
   *
   * @param referenceHash The reference hash to compare against
   * @param hashes Array of hashes to order
   * @param includeIndex Whether to include original array index (default: false)
   * @returns Array of SimilarityMatch objects ordered by distance (ascending)
   */
  static orderBySimilarity(
    referenceHash: PDQHash,
    hashes: PDQHash[],
    includeIndex: boolean = false
  ): SimilarityMatch[] {
    if (referenceHash.length !== 32) {
      throw new Error(`Invalid reference hash length. Expected 32 bytes, but got ${referenceHash.length}.`);
    }

    // Calculate distance and similarity for each hash
    const matches: SimilarityMatch[] = hashes.map((hash, index) => {
      if (hash.length !== 32) {
        throw new Error(`Invalid hash length at index ${index}. Expected 32 bytes, got ${hash.length}.`);
      }

      const distance = this.hammingDistance(referenceHash, hash);
      const similarity = ((256 - distance) / 256) * 100;

      const match: SimilarityMatch = {
        hash,
        distance,
        similarity,
      };

      if (includeIndex) {
        match.index = index;
      }

      return match;
    });

    // Sort by distance (ascending - most similar first)
    matches.sort((a, b) => a.distance - b.distance);

    return matches;
  }
}

// Default export
export default PDQ;
