/**
 * Browser-specific utilities for PDQ perceptual hashing
 * These utilities provide convenient helpers for working with PDQ in browser environments
 */

import { PDQ } from './pdq';
import type { PDQHash, ImageData } from './types';

/**
 * Environment detection result
 */
export interface RuntimeEnvironment {
  /** Type of environment detected */
  type: 'browser' | 'worker' | 'node' | 'unknown';
  /** Whether the environment supports generateHashFromDataUrl */
  supportsDataUrl: boolean;
  /** Whether the environment supports generateHashFromBlob */
  supportsBlob: boolean;
  /** Recommended hash generation function name */
  recommendedAPI: string;
}

/**
 * Detect the current runtime environment and recommend the appropriate API
 *
 * @returns Environment information and API recommendations
 *
 * @example
 * ```typescript
 * import { getEnvironment } from 'pdq-wasm/browser';
 *
 * const env = getEnvironment();
 * console.log(`Running in: ${env.type}`);
 * console.log(`Use: ${env.recommendedAPI}`);
 *
 * if (env.supportsBlob) {
 *   const hash = await generateHashFromBlob(file);
 * } else if (env.supportsDataUrl) {
 *   const hash = await generateHashFromDataUrl(dataUrl);
 * }
 * ```
 */
export function getEnvironment(): RuntimeEnvironment {
  // Check for Web Worker
  const isWorker =
    typeof self !== 'undefined' &&
    // @ts-ignore - importScripts only exists in workers
    typeof importScripts === 'function' &&
    typeof window === 'undefined';

  // Check for browser main thread
  const isBrowser =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined';

  // Check for Node.js
  const isNode =
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null;

  // Check API availability
  const supportsBlob =
    typeof createImageBitmap !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined';

  const supportsDataUrl =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Image !== 'undefined';

  // Determine environment type
  let type: RuntimeEnvironment['type'];
  let recommendedAPI: string;

  if (isWorker) {
    type = 'worker';
    recommendedAPI = supportsBlob ? 'generateHashFromBlob()' : 'Not supported - upgrade browser';
  } else if (isBrowser) {
    type = 'browser';
    // Prefer blob API for better performance and worker compatibility
    recommendedAPI = supportsBlob ? 'generateHashFromBlob()' : 'generateHashFromDataUrl()';
  } else if (isNode) {
    type = 'node';
    recommendedAPI = 'PDQ.hash() with image buffer';
  } else {
    type = 'unknown';
    recommendedAPI = 'Unknown environment';
  }

  return {
    type,
    supportsDataUrl,
    supportsBlob,
    recommendedAPI,
  };
}

/**
 * Result from a hash existence lookup
 */
export interface HashLookupResult {
  /** Whether the hash exists in the storage system */
  exists: boolean;
  /** Optional data associated with the existing hash */
  existing?: any;
}

/**
 * Simple LRU (Least Recently Used) cache implementation
 * @internal
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete if exists to update position
    this.cache.delete(key);

    // Add to end (most recently used)
    this.cache.set(key, value);

    // Evict least recently used if over size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Hash checker function with optional chainable modifiers
 */
export type HashChecker = ((hash: string) => Promise<HashLookupResult>) & {
  /**
   * Returns a new checker that gracefully handles invalid hashes
   * Invalid hashes return `{ exists: false, existing: null }` instead of throwing
   *
   * @example
   * ```typescript
   * const checker = createHashChecker(lookup).ignoreInvalid();
   *
   * // Invalid hash - returns false instead of throwing
   * const result = await checker('invalid'); // { exists: false, existing: null }
   * ```
   */
  ignoreInvalid(): HashChecker;

  /**
   * Returns a new checker with result caching (memoization)
   *
   * @param ttl - Time-to-live in milliseconds (default: Infinity - cache forever)
   * @param maxSize - Maximum number of entries to cache (default: 1000). Uses LRU eviction.
   *
   * @example
   * ```typescript
   * // Cache forever with default max size (1000 entries)
   * const checker = createHashChecker(lookup).cached();
   *
   * // Cache with 5 minute expiration and custom max size
   * const checker = createHashChecker(lookup).cached(5 * 60 * 1000, 500);
   *
   * // Cache with custom max size only (no TTL)
   * const checker = createHashChecker(lookup).cached(Infinity, 100);
   *
   * // Clear cache when needed
   * checker.clearCache?.();
   * ```
   */
  cached(ttl?: number, maxSize?: number): HashChecker;

  /**
   * Clears the cache (only available on cached checkers)
   */
  clearCache?(): void;
};

/**
 * Options for createHashChecker internal state
 * @internal
 */
interface CheckerOptions {
  ignoreInvalid: boolean;
  cached: boolean;
  cache: LRUCache<string, { result: HashLookupResult; timestamp: number }>;
  cacheTTL: number;
  cacheMaxSize: number;
}

/**
 * Creates a hash existence checker with a custom lookup function
 * Supports fluent API for validation and caching behavior
 *
 * @param lookup - Function that checks if a hash exists in your storage system
 * @returns A hash checker function with chainable modifiers
 *
 * @example
 * ```typescript
 * // Simple checker - throws on invalid hash
 * const checkHash = createHashChecker(async (hash) => {
 *   const { data } = await supabase.rpc('check_hash_exists', { p_hash: hash });
 *   return data;
 * });
 *
 * const result = await checkHash(myHash);
 * ```
 *
 * @example
 * ```typescript
 * // With REST API
 * const checkHash = createHashChecker(async (hash) => {
 *   const response = await fetch(`/api/hashes/${hash}`);
 *   return response.json();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Gracefully ignore invalid hashes
 * const checkHash = createHashChecker(lookup).ignoreInvalid();
 *
 * // Invalid hash returns { exists: false } instead of throwing
 * const result = await checkHash('invalid-hash');
 * ```
 *
 * @example
 * ```typescript
 * // Cached with TTL
 * const checkHash = createHashChecker(lookup).cached(5 * 60 * 1000);
 *
 * // First call hits the database
 * await checkHash(hash1);
 *
 * // Second call within 5 minutes uses cached result
 * await checkHash(hash1);
 * ```
 *
 * @example
 * ```typescript
 * // Combined - ignore invalid + cached
 * const checkHash = createHashChecker(lookup)
 *   .ignoreInvalid()
 *   .cached(60 * 60 * 1000); // 1 hour cache
 *
 * // Clear cache when needed
 * checkHash.clearCache?.();
 * ```
 */
export function createHashChecker(
  lookup: (hash: string) => Promise<HashLookupResult>
): HashChecker {
  return createCheckerWithOptions(lookup, {
    ignoreInvalid: false,
    cached: false,
    cache: new LRUCache(1000), // Default max size
    cacheTTL: Infinity,
    cacheMaxSize: 1000
  });
}

/**
 * Internal function to create checker with specific options
 * @internal
 */
function createCheckerWithOptions(
  lookup: (hash: string) => Promise<HashLookupResult>,
  options: CheckerOptions
): HashChecker {
  const checker = async (hash: string): Promise<HashLookupResult> => {
    // Validate hash format (PDQ hashes are 64 hex characters)
    const isValid = typeof hash === 'string' &&
                   hash.length === 64 &&
                   /^[0-9a-f]{64}$/i.test(hash);

    if (!isValid) {
      if (options.ignoreInvalid) {
        return { exists: false, existing: null };
      }
      throw new Error('Invalid PDQ hash: must be 64 hexadecimal characters');
    }

    // Normalize hash to lowercase for cache key consistency
    const normalizedHash = hash.toLowerCase();

    // Check cache if enabled
    if (options.cached && options.cache.has(normalizedHash)) {
      const cached = options.cache.get(normalizedHash)!;
      const age = Date.now() - cached.timestamp;

      if (age < options.cacheTTL) {
        return cached.result;
      }
      // Expired, remove it
      options.cache.delete(normalizedHash);
    }

    // Perform lookup
    const result = await lookup(normalizedHash);

    // Store in cache if enabled
    if (options.cached) {
      options.cache.set(normalizedHash, {
        result,
        timestamp: Date.now()
      });
    }

    return result;
  };

  // Attach chainable methods (cast once for type safety)
  const hashChecker = checker as HashChecker;

  hashChecker.ignoreInvalid = () => {
    return createCheckerWithOptions(lookup, {
      ...options,
      ignoreInvalid: true
    });
  };

  hashChecker.cached = (ttl: number = Infinity, maxSize: number = 1000) => {
    return createCheckerWithOptions(lookup, {
      ...options,
      cached: true,
      cacheTTL: ttl,
      cache: new LRUCache(maxSize),
      cacheMaxSize: maxSize
    });
  };

  // Add cache management for cached checkers
  if (options.cached) {
    hashChecker.clearCache = () => {
      options.cache.clear();
    };
  }

  return hashChecker;
}

/**
 * Calculate Hamming distance between two PDQ hash strings (hex format)
 * Convenience wrapper around PDQ.hammingDistance that works with hex strings
 *
 * @param hash1 - First PDQ hash (64 hex characters)
 * @param hash2 - Second PDQ hash (64 hex characters)
 * @returns Hamming distance (0-256, where 0 = identical, 256 = completely different)
 *
 * @throws Error if either hash is not 64 hex characters
 *
 * @example
 * ```typescript
 * const hash1 = 'a1b2c3d4...'; // 64 hex chars
 * const hash2 = 'e5f6g7h8...'; // 64 hex chars
 *
 * const distance = hammingDistance(hash1, hash2);
 * console.log(`Distance: ${distance} bits`);
 *
 * if (distance <= 31) {
 *   console.log('Images are likely duplicates');
 * }
 * ```
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== 64 || hash2.length !== 64) {
    throw new Error('PDQ hashes must be exactly 64 hex characters');
  }

  if (!/^[0-9a-f]{64}$/i.test(hash1) || !/^[0-9a-f]{64}$/i.test(hash2)) {
    throw new Error('PDQ hashes must contain only hexadecimal characters');
  }

  const arr1 = PDQ.fromHex(hash1);
  const arr2 = PDQ.fromHex(hash2);

  return PDQ.hammingDistance(arr1, arr2);
}

/**
 * Image data structure for PDQ hashing
 * Note: RGBA data from canvas is automatically converted to RGB internally
 */
export interface PDQImageData {
  data: Uint8Array;
  width: number;
  height: number;
  channels: 1 | 3;
}

/**
 * Generate PDQ hash from a Blob or File in a worker-compatible way
 *
 * **✅ RECOMMENDED** - Works in both browser main thread and Web Workers
 *
 * Uses modern browser APIs (createImageBitmap + OffscreenCanvas) that work across contexts.
 * This is the **preferred API** for most use cases, especially if you need Web Worker support.
 *
 * **For Workers:** This is the ONLY API that works - {@link generateHashFromDataUrl} will fail.
 *
 * **Browser Support:**
 * - Chrome 69+ (full support)
 * - Firefox 105+ (OffscreenCanvas added in 105)
 * - Safari 16.4+ (OffscreenCanvas support)
 * - Edge 79+
 *
 * **For older browsers** (main thread only), use {@link generateHashFromDataUrl} as fallback.
 *
 * @param blob Image blob or file
 * @returns Hex-encoded PDQ hash (64 character hex string)
 * @throws {Error} If createImageBitmap or OffscreenCanvas unavailable
 * @throws {Error} If image fails to decode or has invalid dimensions
 * @throws {Error} If image exceeds maximum dimension limit (10,000px)
 *
 * @see {@link generateHashFromDataUrl} for legacy browser fallback (main thread only)
 * @see {@link getEnvironment} to detect runtime environment and choose the right API
 *
 * @example
 * ```typescript
 * // ✅ In a Web Worker (PREFERRED)
 * self.onmessage = async (event) => {
 *   const file = event.data.file;
 *   const hash = await generateHashFromBlob(file);
 *   self.postMessage({ hash });
 * };
 * ```
 *
 * @example
 * ```typescript
 * // ✅ In a browser main thread (also works)
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 * const hash = await generateHashFromBlob(file);
 * console.log('Hash:', hash);
 * ```
 *
 * @example
 * ```typescript
 * // ✅ With fetch API
 * const response = await fetch('image.jpg');
 * const blob = await response.blob();
 * const hash = await generateHashFromBlob(blob);
 * ```
 */
export async function generateHashFromBlob(blob: Blob): Promise<string> {
  // Check if createImageBitmap is available (works in both browsers and workers)
  if (typeof createImageBitmap === 'undefined') {
    throw new Error(
      'createImageBitmap is not available in this environment. ' +
      'For older browsers (main thread), use generateHashFromDataUrl() instead. ' +
      'Minimum browser versions: Chrome 69+, Firefox 105+, Safari 16.4+, Edge 79+.'
    );
  }

  // Check if OffscreenCanvas is available
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(
      'OffscreenCanvas is not available in this environment. ' +
      'For older browsers (main thread), use generateHashFromDataUrl() as a fallback. ' +
      'Minimum browser versions: Chrome 69+, Firefox 105+, Safari 16.4+, Edge 79+.'
    );
  }

  // Create an ImageBitmap from the blob with proper error handling
  let imageBitmap: ImageBitmap;
  try {
    imageBitmap = await createImageBitmap(blob);
  } catch (error) {
    throw new Error(
      `Failed to decode image: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      'The file may be corrupted or in an unsupported format.'
    );
  }

  // Validate image dimensions
  if (!imageBitmap.width || !imageBitmap.height) {
    imageBitmap.close();
    throw new Error('Image has invalid dimensions (width or height is 0)');
  }

  // Add size limits to prevent DOS attacks via huge images
  const MAX_DIMENSION = 10000; // 10,000 pixels max on any side
  if (imageBitmap.width > MAX_DIMENSION || imageBitmap.height > MAX_DIMENSION) {
    imageBitmap.close();
    throw new Error(
      `Image too large: ${imageBitmap.width}x${imageBitmap.height} pixels. ` +
      `Maximum allowed: ${MAX_DIMENSION}x${MAX_DIMENSION}`
    );
  }

  try {
    // Create an OffscreenCanvas to extract pixel data
    // NOTE: For performance optimization in high-throughput scenarios, consider
    // caching and reusing a single OffscreenCanvas and 2D context. However, this
    // would require careful size management and thread safety considerations in workers.
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get 2D context from OffscreenCanvas');
    }

    // Draw the image to the canvas
    ctx.drawImage(imageBitmap, 0, 0);

    // Get image data (RGBA format)
    const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);

    // Convert RGBA to RGB (PDQ only supports RGB or grayscale)
    const rgbData = new Uint8Array(imageBitmap.width * imageBitmap.height * 3);
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
      rgbData[j] = imageData.data[i];       // R
      rgbData[j + 1] = imageData.data[i + 1]; // G
      rgbData[j + 2] = imageData.data[i + 2]; // B
      // Skip alpha channel
    }

    // Prepare PDQ image data structure
    const pdqImageData: ImageData = {
      data: rgbData,
      width: imageBitmap.width,
      height: imageBitmap.height,
      channels: 3 // RGB
    };

    // Generate PDQ hash
    const result = PDQ.hash(pdqImageData);
    return PDQ.toHex(result.hash);
  } finally {
    // Clean up the ImageBitmap (check if close() exists for compatibility)
    if (typeof imageBitmap.close === 'function') {
      imageBitmap.close();
    }
  }
}

/**
 * Generate PDQ perceptual hash from an image data URL or blob URL
 *
 * **⚠️ BROWSER MAIN THREAD ONLY** - Requires DOM APIs (Image, Canvas, document)
 *
 * **For Web Workers:** Use {@link generateHashFromBlob} instead, which works in both
 * browsers and workers using modern APIs (createImageBitmap + OffscreenCanvas).
 *
 * **Migration Guide:**
 * ```typescript
 * // ❌ DON'T use in workers (will throw error)
 * const hash = await generateHashFromDataUrl(dataUrl);
 *
 * // ✅ DO use in workers
 * const hash = await generateHashFromBlob(file); // file is Blob/File
 * ```
 *
 * **Auto-cleanup:** Blob URLs can be automatically revoked after processing using the
 * `autoRevoke` parameter to prevent memory leaks. Useful when you don't need the blob
 * URL for preview display. Data URLs (data:image/...) are never revoked.
 *
 * @param dataUrl - Image data URL (data:image/...) or blob URL (blob:...)
 * @param autoRevoke - Automatically revoke blob URLs after processing (default: false)
 * @returns Promise resolving to 64-character hex hash string
 *
 * @throws Error if called in non-browser main thread environment (e.g., Web Worker, Node.js)
 * @throws Error if image fails to load
 * @throws Error if canvas context cannot be obtained
 *
 * @see {@link generateHashFromBlob} for worker-compatible alternative
 * @see {@link getEnvironment} to detect runtime environment and choose the right API
 *
 * @example
 * ```typescript
 * // Auto-revoke blob URL (when you don't need it for display)
 * const file = input.files[0];
 * const blobUrl = URL.createObjectURL(file);
 * const hash = await generateHashFromDataUrl(blobUrl, true);
 * // Blob URL automatically revoked!
 * ```
 *
 * @example
 * ```typescript
 * // Keep blob URL for preview (manual revocation required)
 * const blobUrl = URL.createObjectURL(file);
 * const hash = await generateHashFromDataUrl(blobUrl, false);
 * // Display preview using blobUrl...
 * // Later: URL.revokeObjectURL(blobUrl);
 * ```
 *
 * @example
 * ```typescript
 * // From canvas (data URLs don't need revocation)
 * const canvas = document.getElementById('myCanvas');
 * const dataUrl = canvas.toDataURL('image/png');
 * const hash = await generateHashFromDataUrl(dataUrl);
 * ```
 */
export async function generateHashFromDataUrl(
  dataUrl: string,
  autoRevoke: boolean = false
): Promise<string> {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Detect if we're in a Web Worker
    // @ts-ignore - importScripts only exists in workers
    const isWorker = typeof self !== 'undefined' && typeof importScripts === 'function';

    throw new Error(
      'generateHashFromDataUrl() requires browser main thread (needs DOM APIs). ' +
      (isWorker
        ? 'For Web Workers, use generateHashFromBlob() instead, which uses worker-compatible APIs (createImageBitmap + OffscreenCanvas). ' +
          'Example: const hash = await generateHashFromBlob(file);'
        : 'For Node.js, use the core PDQ API with image buffers. ') +
      'See examples/worker/README.md for more details.'
    );
  }

  // Check if this is a blob URL and should be auto-revoked
  const isBlobUrl = dataUrl.startsWith('blob:');
  const shouldRevoke = isBlobUrl && autoRevoke;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          // Revoke blob URL on error if auto-revoke enabled
          if (shouldRevoke) {
            URL.revokeObjectURL(dataUrl);
          }
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Use original image dimensions
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image
        ctx.drawImage(img, 0, 0);

        // Get image data (RGBA format from canvas)
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        // Convert RGBA to RGB (PDQ only supports RGB or grayscale)
        const rgbData = new Uint8Array(img.width * img.height * 3);
        for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
          rgbData[j] = imageData.data[i];       // R
          rgbData[j + 1] = imageData.data[i + 1]; // G
          rgbData[j + 2] = imageData.data[i + 2]; // B
          // Skip alpha channel
        }

        // Prepare PDQ image data structure
        const pdqImageData: ImageData = {
          data: rgbData,
          width: img.width,
          height: img.height,
          channels: 3 // RGB
        };

        // Generate PDQ hash
        const result = PDQ.hash(pdqImageData);
        const hexHash = PDQ.toHex(result.hash);

        // Revoke blob URL after successful processing if enabled
        if (shouldRevoke) {
          URL.revokeObjectURL(dataUrl);
        }

        resolve(hexHash);
      } catch (error) {
        // Revoke blob URL on error if auto-revoke enabled
        if (shouldRevoke) {
          URL.revokeObjectURL(dataUrl);
        }
        reject(error);
      }
    };

    img.onerror = () => {
      // Revoke blob URL on load error if auto-revoke enabled
      if (shouldRevoke) {
        URL.revokeObjectURL(dataUrl);
      }
      reject(new Error('Failed to load image'));
    };

    img.src = dataUrl;
  });
}

/**
 * File with hash metadata
 */
export interface FileWithHash {
  /** Unique identifier for the file */
  id: string;
  /** File name */
  name: string;
  /** Preview data URL or blob URL */
  preview: string;
  /** MIME type */
  type: string;
  /** Optional metadata including hash information */
  meta?: {
    /** PDQ hash (64 hex characters) or null if hashing failed */
    hash?: string | null;
    /** Error message if hashing failed */
    hashError?: string;
    /** Whether file is selected */
    isSelected?: boolean;
    /** File location */
    location?: string;
    /** User note */
    note?: string;
  };
}

/**
 * Progress information for duplicate detection
 */
export interface DetectionProgress {
  /** Total number of files to process */
  totalFiles: number;
  /** Number of files processed so far */
  processedFiles: number;
  /** Name of file currently being processed */
  currentFile: string;
  /** Number of duplicates found so far */
  duplicatesFound: number;
}

/**
 * Callback function for progress updates
 */
export type ProgressCallback = (progress: DetectionProgress) => void;

/**
 * Detect duplicate images by comparing PDQ perceptual hashes
 * Generates hashes for all images and finds groups of similar images
 *
 * @param files - Array of files with preview URLs
 * @param threshold - Hamming distance threshold for duplicates (default: 31, PDQ recommended)
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to array of duplicate groups
 *
 * @example
 * ```typescript
 * const files = [
 *   { id: '1', name: 'photo1.jpg', preview: 'blob:...', type: 'image/jpeg' },
 *   { id: '2', name: 'photo2.jpg', preview: 'blob:...', type: 'image/jpeg' },
 * ];
 *
 * const duplicates = await detectDuplicatesByHash(files);
 *
 * duplicates.forEach(group => {
 *   console.log('Duplicate group:');
 *   group.forEach(file => console.log(`  - ${file.name}`));
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With progress callback
 * const duplicates = await detectDuplicatesByHash(
 *   files,
 *   31,
 *   (progress) => {
 *     console.log(`${progress.processedFiles}/${progress.totalFiles} processed`);
 *     console.log(`Currently processing: ${progress.currentFile}`);
 *     console.log(`Duplicates found: ${progress.duplicatesFound}`);
 *   }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Custom threshold (more strict)
 * const duplicates = await detectDuplicatesByHash(files, 15);
 * ```
 */
export async function detectDuplicatesByHash(
  files: FileWithHash[],
  threshold: number = 31,
  onProgress?: ProgressCallback
): Promise<FileWithHash[][]> {
  // Filter only image files
  const imageFiles = files.filter(file =>
    file.type.startsWith('image/') && file.preview
  );

  if (imageFiles.length < 2) {
    return [];
  }

  // Initialize progress tracking
  let processedFiles = 0;
  let duplicatesFound = 0;

  // Generate hashes for all images, tracking any errors
  const filesWithHashes = await Promise.all(
    imageFiles.map(async (file) => {
      const newMeta: { hash: string | null; hashError?: string } = { hash: null };

      try {
        newMeta.hash = await generateHashFromDataUrl(file.preview);
      } catch (error) {
        newMeta.hashError = error instanceof Error ? error.message : String(error);
      }

      processedFiles++;

      // Report progress after processing (single progress update per file)
      if (onProgress) {
        onProgress({
          totalFiles: imageFiles.length,
          processedFiles,
          currentFile: file.name,
          duplicatesFound
        });
      }

      return {
        ...file,
        meta: {
          ...file.meta,
          ...newMeta
        }
      };
    })
  );

  // Find duplicates by comparing hashes
  const duplicateGroups: FileWithHash[][] = [];
  const processed = new Set<string>();

  for (let i = 0; i < filesWithHashes.length; i++) {
    const file1 = filesWithHashes[i];
    if (!file1.meta?.hash || processed.has(file1.id)) continue;

    const group = [file1];
    processed.add(file1.id);

    for (let j = i + 1; j < filesWithHashes.length; j++) {
      const file2 = filesWithHashes[j];
      if (!file2.meta?.hash || processed.has(file2.id)) continue;

      // Calculate PDQ hamming distance (synchronous - no I/O)
      const distance = hammingDistance(file1.meta.hash, file2.meta.hash);

      if (distance <= threshold) {
        group.push(file2);
        processed.add(file2.id);
      }
    }

    // Only add groups with duplicates
    if (group.length > 1) {
      duplicateGroups.push(group);
      duplicatesFound += group.length;

      // Report updated duplicate count
      if (onProgress) {
        onProgress({
          totalFiles: imageFiles.length,
          processedFiles: imageFiles.length,
          currentFile: '',
          duplicatesFound
        });
      }
    }
  }

  // Final progress report
  if (onProgress) {
    onProgress({
      totalFiles: imageFiles.length,
      processedFiles: imageFiles.length,
      currentFile: '',
      duplicatesFound
    });
  }

  return duplicateGroups;
}
