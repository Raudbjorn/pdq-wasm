# PDQ WASM Examples

This directory contains practical examples demonstrating how to use PDQ WASM in different environments.

## Examples Overview

### 1. Browser Example (`browser/`)

Interactive web application demonstrating PDQ hashing in the browser.

**Features:**
- Upload and hash images directly in the browser
- Compare two images and see their similarity score
- Visual interface with real-time results
- Uses Canvas API for image processing

**Running the example:**

```bash
# From the pdq-wasm root directory
cd examples/browser

# Serve with any static file server, e.g.:
npx serve .

# Or use Python:
python -m http.server 8000

# Then open http://localhost:8000 in your browser
```

**Note:** You need to serve the files with a local server (not `file://`) due to WASM module loading restrictions.

### 2. Node.js Examples (`nodejs/`)

#### Basic Usage (`basic-usage.js`)

Demonstrates core PDQ operations with synthetic images.

**Running:**

```bash
# From the pdq-wasm root directory
cd examples/nodejs
node basic-usage.js
```

**What it demonstrates:**
- Initializing PDQ WASM
- Hashing grayscale and RGB images
- Calculating Hamming distance
- Hash format conversion (binary ↔ hex)
- Similarity comparison

#### Image Comparison (`image-comparison.js`)

Real-world example comparing actual image files.

**Prerequisites:**

```bash
npm install sharp  # Image processing library
```

**Running:**

```bash
node image-comparison.js image1.jpg image2.jpg image3.jpg
```

**What it demonstrates:**
- Loading images from disk
- Processing real image files
- Pairwise comparison of multiple images
- Identifying similar images using PDQ threshold

## Installation

### Using from npm (published package)

```bash
npm install pdq-wasm
```

### Using local build

```bash
# From the pdq-wasm root directory
npm install
npm run build

# The examples will use the local build from ../../dist/
```

## Quick Start Code Snippets

### Browser (ES Modules)

```javascript
import { PDQ } from 'pdq-wasm';

// Initialize once
await PDQ.init();

// Hash an image from Canvas
const canvas = document.getElementById('myCanvas');
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
```

### Node.js (CommonJS)

```javascript
const { PDQ } = require('pdq-wasm');
const sharp = require('sharp');

async function hashImage(filePath) {
  await PDQ.init();

  const img = sharp(filePath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const result = PDQ.hash({
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels
  });

  return PDQ.toHex(result.hash);
}
```

### Comparing Images

```javascript
await PDQ.init();

// ... generate hash1 and hash2 ...

// Method 1: Manual comparison
const distance = PDQ.hammingDistance(hash1, hash2);
const similarity = PDQ.similarity(hash1, hash2);

console.log(`Distance: ${distance}/256`);
console.log(`Similarity: ${similarity.toFixed(2)}%`);

// Method 2: Using similarity threshold (default: 31)
const areSimilar = PDQ.isSimilar(hash1, hash2);
console.log(`Similar? ${areSimilar}`);

// Method 3: Custom threshold
const areSimilarCustom = PDQ.isSimilar(hash1, hash2, 50);
```

## API Reference

See the main [README.md](../README.md) for complete API documentation.

## Common Use Cases

### Duplicate Image Detection

```javascript
const threshold = 31; // PDQ recommended threshold
const distance = PDQ.hammingDistance(hash1, hash2);

if (distance <= threshold) {
  console.log('Images are likely duplicates or near-duplicates');
}
```

### Content Moderation

```javascript
// Build a database of known inappropriate content hashes
const bannedHashes = [...]; // Load from database

// Check new upload against banned content
const uploadHash = PDQ.hash(uploadedImageData);

for (const bannedHash of bannedHashes) {
  const distance = PDQ.hammingDistance(uploadHash.hash, bannedHash);
  if (distance <= 31) {
    console.warn('Content flagged as inappropriate');
    break;
  }
}
```

### Similar Image Search

```javascript
// Find images similar to a query image using orderBySimilarity
const queryHash = PDQ.hash(queryImageData);

// Extract hashes from database
const dbHashes = imageDatabase.map(img => img.hash);

// Order by similarity (most similar first)
const ordered = PDQ.orderBySimilarity(queryHash.hash, dbHashes, true);

// Get top 10 most similar with original indices
const topResults = ordered.slice(0, 10).map(match => ({
  image: imageDatabase[match.index],
  distance: match.distance,
  similarity: match.similarity
}));

console.log('Top 10 similar images:');
topResults.forEach((result, i) => {
  console.log(`${i + 1}. ${result.image.name}: ${result.similarity.toFixed(2)}% similar`);
});
```

### Efficient Batch Similarity Ranking

```javascript
// Old approach: manual sorting (O(n log n) + O(n) comparisons)
const results = dbHashes.map(hash => ({
  hash,
  distance: PDQ.hammingDistance(queryHash, hash),
  similarity: PDQ.similarity(queryHash, hash)
})).sort((a, b) => a.distance - b.distance);

// New approach: using orderBySimilarity (optimized)
const ordered = PDQ.orderBySimilarity(queryHash, dbHashes);
// Returns pre-sorted results with distance and similarity already calculated
```

## Troubleshooting

### "WebAssembly module failed to load"

Make sure you're serving the files over HTTP(S), not using `file://` protocol. Use a local server:

```bash
npx serve .
# or
python -m http.server 8000
```

### "Cannot find module 'pdq-wasm'"

Make sure you've installed the package:

```bash
npm install pdq-wasm
```

Or if using the local build, ensure you've run:

```bash
npm run build
```

### "sharp module not found" (Node.js examples)

The image comparison example requires Sharp:

```bash
npm install sharp
```

### Module initialization errors

Always call `await PDQ.init()` before using any PDQ functions:

```javascript
await PDQ.init();  // Must be called once before using PDQ
const result = PDQ.hash(...);
```

## Performance Tips

1. **Initialize once**: Call `PDQ.init()` only once at application startup
2. **Reuse hashes**: Store generated hashes instead of recalculating
3. **Batch comparisons**: When comparing against many hashes, precompute and store them
4. **Use hex for storage**: Store hashes as hex strings (64 chars) for easy database storage

## Further Reading

- [Meta PDQ Algorithm](https://github.com/facebook/ThreatExchange/tree/main/pdq) - Original C++ implementation
- [PDQ Paper](https://github.com/facebook/ThreatExchange/blob/main/pdq/docs/pdq_algorithm.md) - Algorithm details
- [Main README](../README.md) - Complete API documentation
- [CONTRIBUTING](../CONTRIBUTING.md) - Development guide
