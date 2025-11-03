# PDQ WebAssembly

[![CI](https://github.com/yourusername/pdq-wasm/workflows/CI/badge.svg)](https://github.com/yourusername/pdq-wasm/actions)
[![npm version](https://badge.fury.io/js/pdq-wasm.svg)](https://www.npmjs.com/package/pdq-wasm)
[![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)

WebAssembly bindings for Meta's PDQ (Perceptual Hashing) algorithm, enabling fast perceptual image hashing in both browser and Node.js environments.

## About PDQ

PDQ is a perceptual hashing algorithm developed by Meta (Facebook) for matching images that look similar to the human eye. It generates a 256-bit hash from an image that can be compared with other hashes using Hamming distance to determine similarity.

**Key features:**
- Fast and efficient perceptual hashing
- Robust to common image transformations (resize, crop, compress, etc.)
- 256-bit compact hash representation
- Hamming distance-based similarity matching
- WebAssembly performance (26KB binary, ~13KB JS wrapper)

## Installation

```bash
npm install pdq-wasm
```

## Quick Start

### Node.js

```javascript
const { PDQ } = require('pdq-wasm');

async function main() {
  // Initialize the WASM module (required once)
  await PDQ.init();

  // Create image data (grayscale or RGB)
  const imageData = {
    data: new Uint8Array(100).fill(128), // 10x10 gray image
    width: 10,
    height: 10,
    channels: 1, // 1 for grayscale, 3 for RGB
  };

  // Generate PDQ hash
  const result = PDQ.hash(imageData);
  console.log('Hash:', PDQ.toHex(result.hash));
  console.log('Quality:', result.quality);

  // Compare two images
  const hash1 = PDQ.hash(imageData);
  const hash2 = PDQ.hash(anotherImageData);

  const distance = PDQ.hammingDistance(hash1.hash, hash2.hash);
  console.log('Hamming distance:', distance);

  const similarity = PDQ.similarity(hash1.hash, hash2.hash);
  console.log('Similarity:', similarity.toFixed(2) + '%');

  // Check if images are similar
  const areSimilar = PDQ.areSimilar(hash1.hash, hash2.hash, 31);
  console.log('Similar?', areSimilar);
}

main();
```

### TypeScript

```typescript
import { PDQ, ImageData, PDQHashResult } from 'pdq-wasm';

async function hashImage(imageData: ImageData): Promise<PDQHashResult> {
  await PDQ.init();
  return PDQ.hash(imageData);
}

// Example with type safety
const imageData: ImageData = {
  data: new Uint8Array(300), // 10x10 RGB image
  width: 10,
  height: 10,
  channels: 3,
};

const result = await hashImage(imageData);
const hexHash: string = PDQ.toHex(result.hash);
```

## API Reference

### Initialization

#### `PDQ.init(options?): Promise<void>`

Initialize the WASM module. Must be called before using any other PDQ methods.

```javascript
await PDQ.init();
```

### Hashing

#### `PDQ.hash(imageData): PDQHashResult`

Generate a PDQ hash from image data.

**Parameters:**
- `imageData`: Object with properties:
  - `data`: `Uint8Array` - Raw pixel data
  - `width`: `number` - Image width in pixels
  - `height`: `number` - Image height in pixels
  - `channels`: `1 | 3` - Number of channels (1 for grayscale, 3 for RGB)

**Returns:** `PDQHashResult`
- `hash`: `Uint8Array` - 32-byte (256-bit) PDQ hash
- `quality`: `number` - Quality metric of the hash

**Example:**
```javascript
const result = PDQ.hash({
  data: new Uint8Array(300),
  width: 10,
  height: 10,
  channels: 3,
});
```

### Comparison

#### `PDQ.hammingDistance(hash1, hash2): number`

Calculate Hamming distance between two PDQ hashes.

**Parameters:**
- `hash1`, `hash2`: `Uint8Array` - 32-byte PDQ hashes

**Returns:** `number` - Distance from 0 (identical) to 256 (completely different)

**Example:**
```javascript
const distance = PDQ.hammingDistance(hash1, hash2);
console.log(`Distance: ${distance}/256`);
```

#### `PDQ.areSimilar(hash1, hash2, threshold?): boolean`

Check if two hashes are similar based on a threshold.

**Parameters:**
- `hash1`, `hash2`: `Uint8Array` - 32-byte PDQ hashes
- `threshold`: `number` - Maximum Hamming distance to consider similar (default: 31)

**Returns:** `boolean` - True if hashes are similar

**Example:**
```javascript
if (PDQ.areSimilar(hash1, hash2, 20)) {
  console.log('Images are similar!');
}
```

#### `PDQ.similarity(hash1, hash2): number`

Get similarity percentage between two hashes.

**Parameters:**
- `hash1`, `hash2`: `Uint8Array` - 32-byte PDQ hashes

**Returns:** `number` - Similarity percentage (0-100)

**Example:**
```javascript
const similarity = PDQ.similarity(hash1, hash2);
console.log(`${similarity.toFixed(2)}% similar`);
```

### Format Conversion

#### `PDQ.toHex(hash): string`

Convert a PDQ hash to hexadecimal string.

**Parameters:**
- `hash`: `Uint8Array` - 32-byte PDQ hash

**Returns:** `string` - 64-character hexadecimal string

**Example:**
```javascript
const hexHash = PDQ.toHex(result.hash);
console.log(hexHash); // "a1b2c3d4..."
```

#### `PDQ.fromHex(hex): Uint8Array`

Convert a hexadecimal string to PDQ hash.

**Parameters:**
- `hex`: `string` - 64-character hexadecimal string

**Returns:** `Uint8Array` - 32-byte PDQ hash

**Example:**
```javascript
const hash = PDQ.fromHex("a1b2c3d4e5f6...");
```

## Image Data Format

PDQ-WASM expects raw pixel data in specific formats:

### Grayscale (1 channel)
```javascript
{
  data: Uint8Array,  // width * height bytes
  width: number,
  height: number,
  channels: 1
}
```

Each byte represents one pixel's grayscale value (0-255).

### RGB (3 channels)
```javascript
{
  data: Uint8Array,  // width * height * 3 bytes
  width: number,
  height: number,
  channels: 3
}
```

Pixels are stored as consecutive RGB triplets: `[R, G, B, R, G, B, ...]`

## Use Cases

- **Content moderation**: Detect duplicate or near-duplicate images
- **Copyright protection**: Find unauthorized copies of images
- **Image search**: Find similar images in large databases
- **Deduplication**: Remove duplicate images from collections
- **Photo organization**: Group similar photos together

## Performance

- Hash generation: ~0.5-2ms for typical images (on modern hardware)
- Hamming distance: <0.1ms
- WASM binary size: 26KB (gzipped: ~10KB)
- Memory efficient: No external dependencies

## Similarity Threshold Guide

Typical Hamming distance thresholds:
- `0-10`: Nearly identical images
- `11-20`: Very similar images (minor edits)
- `21-31`: Similar images (common threshold for duplicates)
- `32-50`: Somewhat similar images
- `50+`: Different images

These values depend on your use case. Experiment to find the right threshold.

## Building from Source

### Prerequisites

- Node.js 16+
- Emscripten SDK (or install via package manager)

```bash
# On Ubuntu/Debian
sudo apt-get install emscripten

# On macOS
brew install emscripten

# On Arch Linux
sudo pacman -S emscripten
```

### Build Steps

```bash
git clone https://github.com/yourusername/pdq-wasm.git
cd pdq-wasm

# Install dependencies
npm install

# Build WASM module
npm run build:wasm

# Build TypeScript
npm run build:ts

# Or build everything
npm run build

# Run tests
npm test
```

## Testing

```bash
# Run test suite
npm test

# Run smoke test
node test-basic.js
```

Test coverage:
- ✅ 30 unit tests
- ✅ Initialization and error handling
- ✅ Hash generation (grayscale and RGB)
- ✅ Hamming distance calculation
- ✅ Format conversion
- ✅ Similarity helpers
- ✅ Edge cases

## Original Implementation

This is a WebAssembly port of the original C++ implementation from Meta's ThreatExchange repository:
- **Repository**: https://github.com/facebook/ThreatExchange
- **PDQ Documentation**: https://github.com/facebook/ThreatExchange/tree/main/pdq
- **Algorithm Paper**: https://github.com/facebook/ThreatExchange/blob/main/hashing/hashing.pdf

## License

BSD 3-Clause License

**Original PDQ algorithm**: Copyright (c) Meta Platforms, Inc. and affiliates.
**WebAssembly bindings**: Copyright (c) 2025

See [LICENSE](./LICENSE) file for full license text.

## Contributing

Contributions are welcome! Please:
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## Changelog

### 0.1.0 (Initial Release)
- ✅ Core PDQ hashing functionality
- ✅ Grayscale and RGB image support
- ✅ Hamming distance calculation
- ✅ Format conversion (hex ↔ bytes)
- ✅ Similarity helpers
- ✅ Comprehensive test suite
- ✅ TypeScript type definitions
- ✅ Node.js support

## Support

For issues with this WebAssembly implementation:
- **Issues**: https://github.com/yourusername/pdq-wasm/issues

For questions about the original PDQ algorithm:
- **Contact**: threatexchange@meta.com
- **Documentation**: https://github.com/facebook/ThreatExchange/tree/main/pdq

## Acknowledgments

- Meta Platforms, Inc. for developing the PDQ algorithm
- ThreatExchange team for the original C++ implementation
- Emscripten team for the amazing WebAssembly toolchain
