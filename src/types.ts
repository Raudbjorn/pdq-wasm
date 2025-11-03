/**
 * PDQ hash representation as a 32-byte Uint8Array (256 bits)
 */
export type PDQHash = Uint8Array;

/**
 * PDQ hash result including the hash and quality score
 */
export interface PDQHashResult {
  /** The 256-bit PDQ hash */
  hash: PDQHash;
  /** Quality score of the hash (0-100) */
  quality: number;
}

/**
 * Image data input for hashing
 */
export interface ImageData {
  /** Pixel data buffer */
  data: Uint8Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Number of channels (3 for RGB, 1 for grayscale) */
  channels: 3 | 1;
}

/**
 * WebAssembly module interface
 */
export interface PDQWasmModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _pdq_hash_from_rgb(
    rgbBuffer: number,
    width: number,
    height: number,
    hashOut: number,
    qualityOut: number
  ): number;
  _pdq_hash_from_gray(
    grayBuffer: number,
    width: number,
    height: number,
    hashOut: number,
    qualityOut: number
  ): number;
  _pdq_hamming_distance(hash1: number, hash2: number): number;
  _pdq_hash_to_hex(hashBytes: number, hexOut: number): void;
  _pdq_hex_to_hash(hexStr: number, hashOut: number): number;
}

/**
 * PDQ configuration options
 */
export interface PDQOptions {
  /** Custom WASM module URL (for browser environments) */
  wasmUrl?: string;
}

/**
 * Similarity match result for ordering operations
 */
export interface SimilarityMatch {
  /** The hash being compared */
  hash: PDQHash;
  /** Hamming distance from reference hash (0-256) */
  distance: number;
  /** Similarity percentage (0-100%) */
  similarity: number;
  /** Optional index of the hash in the original array */
  index?: number;
}
