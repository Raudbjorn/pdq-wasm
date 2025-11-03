# PDQ WebAssembly

WebAssembly bindings for Meta's PDQ (Perceptual Hashing) algorithm, enabling perceptual image hashing in both browser and Node.js environments.

## About PDQ

PDQ is a perceptual hashing algorithm developed by Meta (Facebook) for matching images that look similar to the human eye. It generates a 256-bit hash from an image that can be compared with other hashes using Hamming distance to determine similarity.

Key features:
- Fast and efficient perceptual hashing
- Robust to common image transformations (resize, crop, compress, etc.)
- 256-bit compact hash representation
- Hamming distance-based similarity matching

## Original Implementation

This is a WebAssembly port of the original C++ implementation from Meta's ThreatExchange repository:
- Original Repository: https://github.com/facebook/ThreatExchange
- PDQ Documentation: https://github.com/facebook/ThreatExchange/tree/main/pdq
- Algorithm Paper: https://github.com/facebook/ThreatExchange/blob/main/hashing/pdq/README.md

## Installation

```bash
npm install pdq-wasm
```

## Usage

### Browser

```javascript
import { PDQ } from 'pdq-wasm';

// Initialize the WASM module
await PDQ.ready();

// Hash an image
const hash = await PDQ.hashImage(imageData);

// Compare two hashes
const distance = PDQ.hammingDistance(hash1, hash2);
```

### Node.js

```javascript
const { PDQ } = require('pdq-wasm');

// Initialize the WASM module
await PDQ.ready();

// Hash an image buffer
const hash = await PDQ.hashImageBuffer(buffer, width, height);

// Compare hashes
const distance = PDQ.hammingDistance(hash1, hash2);
```

## Building from Source

### Prerequisites

- Emscripten SDK (emsdk)
- Node.js 16+
- npm or yarn

### Build Steps

```bash
# Install dependencies
npm install

# Build WASM module
npm run build:wasm

# Build TypeScript bindings
npm run build

# Run tests (when implemented)
npm test
```

## API Documentation

_Coming soon after prototype implementation_

## License

BSD 3-Clause License

Original PDQ algorithm: Copyright (c) Meta Platforms, Inc. and affiliates.

See [LICENSE](./LICENSE) file for full license text.

## Contributing

Contributions are welcome! Please ensure:
- Code follows the existing style
- Tests pass (once implemented)
- Documentation is updated for API changes

## References

- [PDQ Algorithm Description](https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md)
- [Meta ThreatExchange](https://developers.facebook.com/docs/threat-exchange/)
- [Perceptual Hashing Research](https://github.com/facebook/ThreatExchange/blob/main/hashing/hashing.pdf)

## Support

For issues related to this WebAssembly implementation, please file an issue on this repository.

For questions about the original PDQ algorithm, contact: threatexchange@meta.com
