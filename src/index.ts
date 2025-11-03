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
  SimilarityMatch,
} from './types';

// Re-export as default
export { PDQ as default } from './pdq';
