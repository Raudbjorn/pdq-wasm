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
  PDQWorkerOptions,
  SimilarityMatch,
  LoggerFunction,
} from './types';

// Import the WASM module factory
// This will be resolved differently in Node.js vs browser
let createPDQModuleFactory: any = null;

// Lazy loader for Node.js environment - deferred to avoid require() in ES modules
function getWasmFactory(): any {
  if (createPDQModuleFactory !== null) {
    return createPDQModuleFactory;
  }

  // Check if we're in Node.js AND require is available (CommonJS or Node.js ESM with require)
  if (typeof process !== 'undefined' && process.versions?.node && typeof require !== 'undefined') {
    // Node.js environment with require available
    try {
      createPDQModuleFactory = require('../wasm/pdq.js');
      return createPDQModuleFactory;
    } catch (e) {
      // WASM module not built yet
      return null;
    }
  }

  // Browser environment or Node.js ESM without require - will need to be provided via options
  return null;
}

/**
 * Detect if we're running in a Web Worker environment
 * Checks for worker-specific globals and absence of window
 */
function isWorkerEnvironment(): boolean {
  return (
    typeof self !== 'undefined' &&
    // Don't require importScripts - ES module workers don't have it
    // Check for worker global scope types or absence of window
    (
      // Check for any worker global scope type
      // @ts-ignore - WorkerGlobalScope types only available in workers
      typeof WorkerGlobalScope !== 'undefined' ||
      // @ts-ignore - DedicatedWorkerGlobalScope only in dedicated workers
      typeof DedicatedWorkerGlobalScope !== 'undefined' ||
      // @ts-ignore - SharedWorkerGlobalScope only in shared workers
      typeof SharedWorkerGlobalScope !== 'undefined' ||
      // Simpler check: absence of window (most reliable for both classic and ES module workers)
      typeof window === 'undefined'
    )
  );
}

/**
 * Detect if we're running in a browser (non-worker) environment
 */
function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && !isWorkerEnvironment();
}

/**
 * PDQ WebAssembly implementation
 */
export class PDQ {
  private static module: PDQWasmModule | null = null;
  private static initPromise: Promise<void> | null = null;
  private static loggerFn: LoggerFunction | null = null;
  private static ignoreInvalidFlag: boolean = false;

  /**
   * Set a custom logger function to log PDQ operations
   * @param logger Function that receives log messages
   * @returns PDQ class for method chaining
   *
   * @example
   * PDQ.logger((msg) => console.log('[PDQ]', msg));
   */
  static setLogger(logger: LoggerFunction): typeof PDQ {
    this.loggerFn = logger;
    return this;
  }

  /**
   * Enable console logging (convenience method)
   * @returns PDQ class for method chaining
   *
   * @example
   * PDQ.consoleLog();
   */
  static consoleLog(): typeof PDQ {
    return this.setLogger(console.log);
  }

  /**
   * Disable logging
   * @returns PDQ class for method chaining
   */
  static disableLogging(): typeof PDQ {
    this.loggerFn = null;
    return this;
  }

  /**
   * Enable ignore invalid mode - log errors instead of throwing
   * @returns PDQ class for method chaining
   *
   * @example
   * PDQ.ignoreInvalid().consoleLog();
   */
  static ignoreInvalid(): typeof PDQ {
    this.ignoreInvalidFlag = true;
    return this;
  }

  /**
   * Disable ignore invalid mode - throw errors normally
   * @returns PDQ class for method chaining
   */
  static throwOnInvalid(): typeof PDQ {
    this.ignoreInvalidFlag = false;
    return this;
  }

  /**
   * Internal logging method
   */
  private static log(message: string): void {
    if (this.loggerFn) {
      this.loggerFn(message);
    }
  }

  /**
   * Internal error handling method
   * Either throws or logs based on ignoreInvalidFlag
   */
  private static handleError(errorMsg: string): void {
    this.log(`ERROR: ${errorMsg}`);
    if (!this.ignoreInvalidFlag) {
      throw new Error(errorMsg);
    }
  }

  /**
   * Initialize the WASM module
   * Must be called before using any PDQ functions
   *
   * @param options Configuration options
   * @param options.wasmUrl URL to load WASM module from (browser only, defaults to CDN)
   *
   * @example
   * // Node.js (uses bundled WASM)
   * await PDQ.init();
   *
   * @example
   * // Browser (automatically uses CDN)
   * await PDQ.init();
   *
   * @example
   * // Browser with custom URL
   * await PDQ.init({
   *   wasmUrl: '/assets/pdq.wasm'
   * });
   */
  static async init(options: PDQOptions = {}): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      this.log('Initializing PDQ WASM module...');

      // Browser environment (non-worker)
      if (isBrowserEnvironment()) {
        // Default to CDN if no wasmUrl provided
        if (!options.wasmUrl) {
          // Use unpkg.com CDN - pins to current package version for stability
          // Users can also use @latest or a different CDN (jsDelivr, etc.)
          const { version } = require('../package.json');
          options.wasmUrl = `https://unpkg.com/pdq-wasm@${version}/wasm/pdq.wasm`;
          this.log(`No wasmUrl provided, using CDN: ${options.wasmUrl}`);
          this.log('For production, consider self-hosting the WASM files for better reliability');
        }

        this.log(`Loading WASM module from: ${options.wasmUrl}`);
        try {
          // Dynamically load the WASM module factory script
          const wasmJsUrl = options.wasmUrl.replace(/\.wasm$/, '.js');

          // Security: Validate URL to prevent insecure content
          // Allow: HTTPS, localhost HTTP, relative URLs (for local development)
          const isHttps = /^https:\/\//.test(wasmJsUrl);
          const isLocalhost = /^http:\/\/localhost(:\d+)?/.test(wasmJsUrl) || /^http:\/\/127\.0\.0\.1(:\d+)?/.test(wasmJsUrl);
          const isRelative = /^\.\.?\//.test(wasmJsUrl) || !/:\/\//.test(wasmJsUrl);

          if (!isHttps && !isLocalhost && !isRelative) {
            throw new Error(
              `Insecure URL: ${wasmJsUrl}. Only HTTPS URLs are allowed for security (localhost HTTP and relative URLs are permitted for development).`
            );
          }

          // Use script.src for better security and CSP compliance
          const script = document.createElement('script');
          script.src = wasmJsUrl;
          script.async = false; // Ensure synchronous execution order

          // Load script and wait for createPDQModule to be available
          await new Promise<void>((resolve, reject) => {
            script.onload = () => {
              // Verify the factory function is available after load
              if (typeof (window as any).createPDQModule === 'function') {
                resolve();
              } else {
                reject(new Error('createPDQModule function not found after script load'));
              }
            };
            script.onerror = () => reject(new Error(`Failed to load WASM module script from ${wasmJsUrl}`));
            document.head.appendChild(script);
          });

          const factory = (window as any).createPDQModule;

          // Initialize with the WASM URL
          this.module = await factory({
            locateFile: (path: string) => {
              if (path.endsWith('.wasm')) {
                return options.wasmUrl!;
              }
              return path;
            }
          });
          this.log('PDQ WASM module initialized successfully (browser)');
        } catch (error) {
          const errorMsg = `Failed to load WASM module from ${options.wasmUrl}: ${error instanceof Error ? error.message : String(error)}`;
          this.log(`ERROR: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      } else {
        // Node.js environment - use bundled WASM
        this.log('Loading WASM module (Node.js)...');
        const factory = getWasmFactory();
        if (!factory) {
          const errorMsg = 'PDQ WASM module not available. Make sure to run: npm run build:wasm';
          this.log(`ERROR: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        this.module = await factory(options);
        this.log('PDQ WASM module initialized successfully (Node.js)');
      }
    })();

    return this.initPromise;
  }

  /**
   * Initialize the WASM module in a Web Worker environment
   * Must be called before using any PDQ functions in a worker
   *
   * @param options Worker initialization options
   * @param options.wasmUrl URL to the WASM file
   * @param options.wasmJsUrl URL to the WASM JavaScript glue code (optional, defaults to wasmUrl.replace('.wasm', '.js'))
   *
   * @example
   * // In a Web Worker
   * await PDQ.initWorker({
   *   wasmUrl: 'https://unpkg.com/pdq-wasm@0.3.3/wasm/pdq.wasm'
   * });
   *
   * @example
   * // With custom JS glue code URL
   * await PDQ.initWorker({
   *   wasmUrl: '/wasm/pdq.wasm',
   *   wasmJsUrl: '/wasm/pdq.js'
   * });
   */
  static async initWorker(options: PDQWorkerOptions): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (!isWorkerEnvironment()) {
      throw new Error(
        'initWorker() can only be called in a Web Worker environment. ' +
        'Use PDQ.init() for browser or Node.js environments.'
      );
    }

    // Apply logger if provided
    if (options.logger) {
      this.setLogger(options.logger);
    }

    this.initPromise = (async () => {
      this.log('Initializing PDQ WASM module in Web Worker...');

      // Derive JS glue code URL from WASM URL if not provided
      const wasmJsUrl = options.wasmJsUrl || (
        options.wasmUrl.endsWith('.wasm')
          ? options.wasmUrl.replace(/\.wasm$/, '.js')
          : options.wasmUrl + '.js'
      );

      this.log(`Loading WASM module from: ${options.wasmUrl}`);
      this.log(`Loading WASM JS glue code from: ${wasmJsUrl}`);

      try {
        let factory: any;
        let useImportScripts = false;

        // Try classic worker approach first (importScripts)
        // @ts-ignore - importScripts is only available in workers
        if (typeof importScripts === 'function') {
          try {
            this.log('Loading via importScripts (classic worker)...');
            // @ts-ignore - importScripts is only available in workers
            importScripts(wasmJsUrl);

            // The glue code should define createPDQModule on the global scope
            factory = (self as any).createPDQModule;

            // Validate that the factory function was properly loaded
            if (typeof factory !== 'function') {
              this.log(
                `ERROR: createPDQModule function not found on global scope after importing ${wasmJsUrl}. ` +
                'This may indicate a custom build or incorrect WASM JS glue code. ' +
                'Ensure that the glue code defines createPDQModule globally. ' +
                'If you are using a custom build, you may need to expose the factory function as self.createPDQModule.'
              );
              throw new Error(
                'PDQ WASM initialization failed: createPDQModule is not defined globally. ' +
                'Check that your WASM JS glue code exposes createPDQModule on the global scope. ' +
                'See documentation for custom builds.'
              );
            }
            useImportScripts = true;
          } catch (importScriptsError) {
            // importScripts failed - likely an ES module worker
            this.log(`importScripts failed (ES module worker?): ${importScriptsError instanceof Error ? importScriptsError.message : String(importScriptsError)}`);
          }
        }

        if (!useImportScripts) {
          // ES module worker fallback - try dynamic import
          this.log('Using dynamic import for ES module worker...');
          try {
            const module = await import(/* webpackIgnore: true */ wasmJsUrl);
            this.log(`Imported module keys: ${Object.keys(module).join(', ')}`);

            // UMD modules export the factory on 'default' when dynamically imported
            factory = module.default;

            // Check if we got a valid factory function
            if (typeof factory !== 'function') {
              // Try named exports as fallback
              factory = (module as any).createPDQModule || (module as any).PDQ;

              if (typeof factory !== 'function') {
                this.log(`Factory type: ${typeof factory}`);
                this.log(`module.default type: ${typeof module.default}`);
                this.log(`module.createPDQModule type: ${typeof (module as any).createPDQModule}`);
                throw new Error(
                  `ES module at ${wasmJsUrl} does not export a valid factory function. ` +
                  `Available exports: ${Object.keys(module).join(', ')}`
                );
              }
            }

            this.log('Successfully loaded factory function from dynamic import');
          } catch (importError) {
            throw new Error(
              'Failed to load WASM module in worker. ' +
              'importScripts is not available and dynamic import failed. ' +
              `Error: ${importError instanceof Error ? importError.message : String(importError)}`
            );
          }
        }

        // Initialize with the WASM URL
        this.module = await factory({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              return options.wasmUrl;
            }
            return path;
          }
        });

        this.log('PDQ WASM module initialized successfully (Web Worker)');
      } catch (error) {
        const errorMsg = `Failed to load WASM module in worker: ${error instanceof Error ? error.message : String(error)}`;
        this.log(`ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    })();

    return this.initPromise;
  }

  /**
   * Ensure the module is initialized
   */
  private static ensureInit(): PDQWasmModule {
    if (!this.module) {
      const errorMsg = 'PDQ module not initialized. Call PDQ.init() first.';
      this.log(`ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
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

    this.log(`Hashing image: ${imageData.width}x${imageData.height}, ${imageData.channels} channels`);

    // Validate input
    const expectedSize = imageData.width * imageData.height * imageData.channels;
    if (imageData.data.length !== expectedSize) {
      const errorMsg = `Invalid image data size. Expected ${expectedSize} bytes, got ${imageData.data.length}`;
      this.handleError(errorMsg);
      if (this.ignoreInvalidFlag) return { hash: new Uint8Array(32), quality: 0 };
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
        const errorMsg = `PDQ hashing failed with code: ${result}`;
        this.log(`ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Read results from WASM memory
      const hash = new Uint8Array(32);
      hash.set(mod.HEAPU8.subarray(hashPtr, hashPtr + 32));
      const quality = mod.HEAP32[qualityPtr >> 2];

      this.log(`Hash generated successfully. Quality: ${quality}`);

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
      const errorMsg = `Invalid hash length. PDQ hashes must be 32 bytes (got ${hash1.length} and ${hash2.length})`;
      this.handleError(errorMsg);
      if (this.ignoreInvalidFlag) return 256; // Return maximum distance for invalid hashes
    }

    const hash1Ptr = mod._malloc(32);
    const hash2Ptr = mod._malloc(32);

    try {
      mod.HEAPU8.set(hash1, hash1Ptr);
      mod.HEAPU8.set(hash2, hash2Ptr);

      const distance = mod._pdq_hamming_distance(hash1Ptr, hash2Ptr);

      if (distance < 0) {
        const errorMsg = 'Failed to calculate Hamming distance';
        this.log(`ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      this.log(`Hamming distance calculated: ${distance}`);

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
      const errorMsg = `Invalid hash length. PDQ hashes must be 32 bytes (got ${hash.length})`;
      this.handleError(errorMsg);
      if (this.ignoreInvalidFlag) return '0'.repeat(64); // Return zero hash
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

      this.log(`Hash converted to hex: ${hex}`);

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

    this.log(`Converting hex to hash: ${hex}`);

    if (hex.length !== 64) {
      const errorMsg = `Invalid hex string length. Must be 64 characters (got ${hex.length})`;
      this.handleError(errorMsg);
      if (this.ignoreInvalidFlag) return new Uint8Array(32); // Return zero hash
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
        const errorMsg = 'Invalid hex string format';
        this.handleError(errorMsg);
        if (this.ignoreInvalidFlag) {
          return new Uint8Array(32); // Return zero hash
        }
      }

      const hash = new Uint8Array(32);
      hash.set(mod.HEAPU8.subarray(hashPtr, hashPtr + 32));

      this.log('Hex converted to hash successfully');

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
    const maxBits = hash1.length * 8; // Total bits in hash
    return ((maxBits - distance) / maxBits) * 100;
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
    this.log(`Ordering ${hashes.length} hashes by similarity to reference`);

    // Validate reference hash length (PDQ hashes are always 32 bytes)
    if (referenceHash.length !== 32) {
      const errorMsg = `Invalid reference hash length. PDQ hashes must be 32 bytes (got ${referenceHash.length})`;
      this.handleError(errorMsg);
      if (this.ignoreInvalidFlag) return []; // Return empty array
    }

    const expectedLength = referenceHash.length;

    // Calculate distance and similarity for each hash
    const matches: SimilarityMatch[] = hashes
      .map((hash, index) => {
        if (hash.length !== expectedLength) {
          const errorMsg = `Invalid hash length at index ${index}. Expected ${expectedLength} bytes, got ${hash.length}`;
          this.handleError(errorMsg);
          if (this.ignoreInvalidFlag) return null; // Skip invalid hash
        }

        const distance = this.hammingDistance(referenceHash, hash);
        const similarity = this.similarity(referenceHash, hash);

        const match: SimilarityMatch = {
          hash,
          distance,
          similarity,
        };

        if (includeIndex) {
          match.index = index;
        }

        return match;
      })
      .filter((match): match is SimilarityMatch => match !== null);

    // Sort by distance (ascending - most similar first)
    // Use secondary sort by original index for stable ordering
    matches.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      // When distances are equal, maintain original order
      const indexA = includeIndex ? (a.index ?? 0) : hashes.indexOf(a.hash);
      const indexB = includeIndex ? (b.index ?? 0) : hashes.indexOf(b.hash);
      return indexA - indexB;
    });

    this.log(`Ordered ${matches.length} hashes. Best match has distance ${matches[0]?.distance ?? 'N/A'}`);

    return matches;
  }
}

// Default export
export default PDQ;
