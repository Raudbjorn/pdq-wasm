/**
 * PDQ WebAssembly - Perceptual image hashing for browser and Node.js
 *
 * Based on Meta's PDQ algorithm from the ThreatExchange project
 * https://github.com/facebook/ThreatExchange/tree/main/pdq
 */

export { PDQ } from './pdq';
export type {
  PDQHash,
  PDQHashResult,
  ImageData,
  PDQOptions,
  PDQWorkerOptions,
  SimilarityMatch,
} from './types';

// Browser utilities
export {
  createHashChecker,
  hammingDistance,
  generateHashFromDataUrl,
  generateHashFromBlob,
  detectDuplicatesByHash,
  getEnvironment,
} from './browser';

export type {
  HashLookupResult,
  HashChecker,
  PDQImageData,
  FileWithHash,
  DetectionProgress,
  ProgressCallback,
  RuntimeEnvironment,
} from './browser';

export { WorkerPool, type WorkerPoolOptions } from './worker-pool';

// Re-export as default
export { PDQ as default } from './pdq';
