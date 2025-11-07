# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2025-11-07

### Fixed
- Fixed CI test failures on Node.js v20 by properly configuring browser test mocking
- Auto-sync package version from package.json instead of hardcoding (fixes version drift in CDN URLs)
- Fixed browser tests to use Node.js initialization path while mocking only required DOM APIs

### Changed
- Browser-specific DOM tests now skip in Jest/Node environment and are properly tested in Playwright E2E tests
- Improved test suite reliability across different Node.js versions (18, 20, 22+)

### Technical Details
- Version is now dynamically read from package.json in src/pdq.ts (line 193-194)
- Browser test mocks simplified to avoid triggering browser code paths during WASM initialization
- 3 browser-specific tests now properly skipped in Node environment (marked with .skip)
- All 85 unit tests now pass in Node.js environment
- Full browser functionality validated through Playwright E2E tests

## [0.3.3] - Previous Release

### Added
- Native Web Worker support with `PDQ.initWorker()`
- Comprehensive error handling with configurable modes
- Batch processing APIs (`detectDuplicatesByHash`, `orderBySimilarity`)
- Multiple image input methods (`generateHashFromBlob`, `generateHashFromDataUrl`)
- Complete TypeScript definitions with JSDoc documentation
- Advanced hash comparison utilities with LRU caching
- Flexible logging and debugging configuration
- Modern package.json exports structure (CommonJS + ESM)
- Browser utilities export (`pdq-wasm/browser`)

### Features
- Worker-compatible image hashing using `createImageBitmap` and `OffscreenCanvas`
- Security validations (HTTPS enforcement, size/dimension limits)
- Automatic blob URL cleanup to prevent memory leaks
- Chainable configuration methods
- Progress tracking for batch operations
- CDN-based WASM loading with fallback options
