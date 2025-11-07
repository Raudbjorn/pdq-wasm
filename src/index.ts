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
} from './browser';

export type {
  HashLookupResult,
  HashChecker,
  PDQImageData,
  FileWithHash,
  DetectionProgress,
  ProgressCallback,
} from './browser';

// Re-export as default
export { PDQ as default } from './pdq';
