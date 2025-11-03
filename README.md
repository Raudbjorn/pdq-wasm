# PDQ WebAssembly

[![CI](https://github.com/Raudbjorn/pdq-wasm/workflows/CI/badge.svg)](https://github.com/Raudbjorn/pdq-wasm/actions)
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

The package is published on npm and includes:
- WebAssembly binaries (~26KB)
- TypeScript definitions
- Browser and Node.js examples
- Complete documentation

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

### Browser (with CDN)

For browser environments, you can load the WASM module from a CDN:

```html
<script type="module">
  import { PDQ } from 'https://unpkg.com/pdq-wasm@0.2.0/dist/index.mjs';

  async function main() {
    // Initialize with WASM URL from CDN
    await PDQ.init({
      wasmUrl: 'https://unpkg.com/pdq-wasm@0.2.0/wasm/pdq.wasm'
    });

    // Now use PDQ as normal
    const canvas = document.getElementById('myCanvas');
    if (!canvas) {
      throw new Error('Canvas element with id="myCanvas" not found');
    }
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Extract RGB data (skip alpha channel)
    const rgbData = new Uint8Array(canvas.width * canvas.height * 3);
    let rgbIndex = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      rgbData[rgbIndex++] = imageData.data[i];     // R
      rgbData[rgbIndex++] = imageData.data[i + 1]; // G
      rgbData[rgbIndex++] = imageData.data[i + 2]; // B
    }

    const result = PDQ.hash({
      data: rgbData,
      width: canvas.width,
      height: canvas.height,
      channels: 3
    });

    console.log('Hash:', PDQ.toHex(result.hash));
    console.log('Quality:', result.quality);
  }

  main();
</script>
```

**Available CDN URLs:**
- **unpkg**: `https://unpkg.com/pdq-wasm@0.2.0/wasm/pdq.wasm`
- **jsDelivr**: `https://cdn.jsdelivr.net/npm/pdq-wasm@0.2.0/wasm/pdq.wasm`
- **GitHub Releases**: `https://github.com/Raudbjorn/pdq-wasm/releases/download/v0.2.0/pdq.wasm` (after uploading WASM as release asset)

For production use with a custom domain, you can:
1. Set up GitHub Pages to serve the WASM files
2. Configure a CNAME for your domain
3. Load from your custom domain: `https://cdn.yourdomain.com/pdq.wasm`

**Security Note:** As a best practice, only load WASM modules from trusted sources. The `wasmUrl` option dynamically loads and executes WebAssembly code in your application. Always verify that the URL points to a trusted CDN or your own infrastructure. For production applications, consider:
- Using Subresource Integrity (SRI) hashes when supported
- Hosting WASM files on your own domain with proper CORS headers
- Implementing Content Security Policy (CSP) to restrict allowed sources

## Examples

We provide comprehensive examples for both browser and Node.js environments:

### Browser Example

Interactive web application demonstrating PDQ hashing in the browser:

```bash
cd examples/browser
npx serve .  # Or any static file server
# Open http://localhost:3000 in your browser
```

**Features:**
- Upload and hash images
- Compare two images visually
- Real-time similarity scores
- Uses Canvas API for image processing

### Node.js Examples

#### Basic Usage

```bash
cd examples/nodejs
node basic-usage.js
```

Demonstrates:
- Initializing PDQ
- Hashing synthetic images
- Hamming distance calculation
- Format conversion

#### Image Comparison

```bash
npm install sharp  # Required for image loading
node image-comparison.js image1.jpg image2.jpg image3.jpg
```

Demonstrates:
- Loading real image files
- Batch comparison of multiple images
- Finding similar images

### More Examples

See the [examples/](./examples/) directory for:
- Complete source code for all examples
- API usage patterns
- Common use cases (duplicate detection, content moderation)
- Performance tips

Full documentation: [examples/README.md](./examples/README.md)

### PostgreSQL Integration

For storing and querying PDQ hashes in PostgreSQL databases:
- Schema design for hash storage
- Efficient similarity queries using SQL
- Using `<` and `>` operators on distances
- Batch operations and performance optimization

Full guide: [docs/POSTGRESQL.md](./docs/POSTGRESQL.md)

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

#### `PDQ.orderBySimilarity(referenceHash, hashes, includeIndex?): SimilarityMatch[]`

Order an array of hashes by similarity to a reference hash. Returns hashes sorted from most similar to least similar.

**Parameters:**
- `referenceHash`: `Uint8Array` - The reference hash to compare against
- `hashes`: `Uint8Array[]` - Array of hashes to order
- `includeIndex`: `boolean` - Whether to include original array index (default: false)

**Returns:** `SimilarityMatch[]` - Array of objects containing:
- `hash`: `Uint8Array` - The hash
- `distance`: `number` - Hamming distance from reference (0-256)
- `similarity`: `number` - Similarity percentage (0-100)
- `index?`: `number` - Original array index (if includeIndex is true)

**Example:**
```javascript
const referenceHash = PDQ.hash(referenceImage).hash;
const candidateHashes = [hash1, hash2, hash3, hash4];

// Order by similarity
const ordered = PDQ.orderBySimilarity(referenceHash, candidateHashes);

// Most similar first
console.log('Most similar:', PDQ.toHex(ordered[0].hash));
console.log('Distance:', ordered[0].distance);
console.log('Similarity:', ordered[0].similarity.toFixed(2) + '%');

// With original indices
const withIndices = PDQ.orderBySimilarity(referenceHash, candidateHashes, true);
console.log('Original index:', withIndices[0].index);
```

**Use Cases:**
- Find top-N most similar images
- Rank search results by similarity
- Deduplicate image collections
- Build image recommendation systems

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

## Hash Serialization

PDQ hashes can be serialized in multiple formats for different use cases:

### Hexadecimal (Recommended for Databases)

```javascript
const hexHash = PDQ.toHex(result.hash);
// "a1b2c3d4e5f6..." (64 characters)

// Store in PostgreSQL
await client.query(
  'INSERT INTO images (pdq_hash) VALUES ($1)',
  [hexHash]
);

// Retrieve and deserialize
const row = await client.query('SELECT pdq_hash FROM images WHERE id = $1', [id]);
const hash = PDQ.fromHex(row.rows[0].pdq_hash);
```

**Best for:** SQL databases (VARCHAR(64) or TEXT), JSON, REST APIs

### Binary (Most Efficient)

```javascript
const binaryHash = Buffer.from(result.hash);
// 32 bytes

// Store in PostgreSQL as BYTEA
await client.query(
  'INSERT INTO images (pdq_hash_binary) VALUES ($1)',
  [binaryHash]
);

// Retrieve
const row = await client.query('SELECT pdq_hash_binary FROM images WHERE id = $1', [id]);
const hash = new Uint8Array(row.rows[0].pdq_hash_binary);
```

**Best for:** Binary databases, file storage, network transmission

### Base64 (Web-Friendly)

```javascript
const base64Hash = Buffer.from(result.hash).toString('base64');
// 44 characters

// Use in URLs or JSON
const response = {
  imageId: 123,
  pdqHash: base64Hash
};

// Deserialize
const hash = new Uint8Array(Buffer.from(base64Hash, 'base64'));
```

**Best for:** URLs, JSON APIs, localStorage

### Important: Comparing Distances, Not Hashes

**You cannot use `<` and `>` on hash values** to determine similarity. Hashes must be compared using Hamming distance:

```javascript
// ❌ INCORRECT - comparing hash values directly
if (hash1 < hash2) { /* This doesn't determine similarity! */ }

// ✅ CORRECT - comparing distances
const distance1 = PDQ.hammingDistance(referenceHash, hash1);
const distance2 = PDQ.hammingDistance(referenceHash, hash2);

if (distance1 < distance2) {
  console.log('hash1 is more similar to reference than hash2');
}
```

For PostgreSQL queries using `<` and `>`, see the [PostgreSQL Integration Guide](./docs/POSTGRESQL.md).

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

### Quick Build

```bash
git clone https://github.com/Raudbjorn/pdq-wasm.git
cd pdq-wasm

# Install dependencies
npm install

# Build everything (WASM + TypeScript)
npm run build

# Run tests
npm test
```

### Prerequisites

- **Node.js** 16+
- **Emscripten** (for WASM compilation)
- **CMake** 3.10+
- **C++ Compiler** (C++11 support)

### Detailed Build Instructions

For comprehensive build instructions including:
- Installing Emscripten, CMake, and all dependencies
- Platform-specific setup (Linux, macOS, Windows/WSL)
- Troubleshooting common build issues
- Advanced build options and CI/CD setup

See: [BUILDING.md](./BUILDING.md)

## Testing

```bash
# Run full test suite
npm test

# Run specific tests
npm test -- pdq.test.ts
npm test -- image-similarity.test.ts

# Run smoke test
node test-basic.js
```

Test coverage:
- ✅ **52 tests total** (100% pass rate)
- ✅ 39 unit tests covering all API functions
- ✅ 13 pairwise image similarity tests
- ✅ Initialization and error handling
- ✅ Hash generation (grayscale and RGB)
- ✅ Hamming distance calculation
- ✅ Format conversion (hex ↔ bytes)
- ✅ Similarity helpers and thresholds
- ✅ Edge cases and validation
- ✅ 324 test images (52,650 pairwise comparisons)
- ✅ Shape-based similarity verification
- ✅ Consistency and determinism tests

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

### 0.1.0 (Initial Release) - Published to npm ✅
- ✅ Core PDQ hashing functionality
- ✅ Grayscale and RGB image support
- ✅ Hamming distance calculation
- ✅ Format conversion (hex ↔ bytes)
- ✅ Similarity helpers
- ✅ Comprehensive test suite (43 tests, 52,650 image comparisons)
- ✅ TypeScript type definitions
- ✅ Browser and Node.js support
- ✅ Complete examples and documentation
- ✅ Published on npm registry

## Support

For issues with this WebAssembly implementation:
- **Issues**: https://github.com/Raudbjorn/pdq-wasm/issues

For questions about the original PDQ algorithm:
- **Contact**: threatexchange@meta.com
- **Documentation**: https://github.com/facebook/ThreatExchange/tree/main/pdq

## Acknowledgments

- Meta Platforms, Inc. for developing the PDQ algorithm
- ThreatExchange team for the original C++ implementation
- Emscripten team for the amazing WebAssembly toolchain
