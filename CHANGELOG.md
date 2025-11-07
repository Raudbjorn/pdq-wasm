# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.8] - 2025-11-07

### Fixed
- **ESM bundler compatibility** - Fixed `require('../package.json')` causing build errors in Vite and other ESM-first bundlers
- **ES module worker initialization** - Fixed `importScripts()` call failing with "Module scripts don't support importScripts()"
- Wrapped `importScripts()` in try-catch to gracefully fall back to dynamic import when it fails
- Made `require()` call non-statically-analyzable to prevent bundler pre-optimization issues

### Technical Details
- **Worker initialization**: `PDQ.initWorker()` now tries `importScripts()` first, catches the error in ES module workers, and falls back to dynamic `import()`
- **Version loading**: Changed direct `require()` to indirect reference: `const req = require; req('../package.json')`
- Added `typeof require !== 'undefined'` check before attempting dynamic require
- Prevents Vite's dependency pre-bundling from failing on CommonJS require statements
- Both classic workers and ES module workers now fully functional with proper fallback logic

## [0.3.7] - 2025-11-07

### Fixed
- **ES module worker support** - Fixed `PDQ.initWorker()` failing in ES module workers (created with `{ type: 'module' }`)
- `isWorkerEnvironment()` no longer requires `importScripts` function, which doesn't exist in ES module workers
- ES module workers now properly detected via `WorkerGlobalScope` and `typeof window === 'undefined'` checks

### Technical Details
- Removed `typeof importScripts === 'function'` requirement from worker environment detection
- ES module worker fallback to dynamic import (lines 348-367) now reachable
- Fixes issue where ES module workers would throw error before reaching fallback logic
- Both classic workers (with `importScripts`) and ES module workers now fully supported

## [0.3.6] - 2025-11-07

### Changed
- **Refactored environment detection** - `generateHashFromDataUrl()` now uses centralized `getEnvironment()` for consistent environment detection across the codebase
- **Code quality improvements** - Used object destructuring for version extraction per ESLint best practices

### Documentation
- **Added E2E test references** - Skipped browser tests now include comments linking to Playwright E2E coverage for traceability
- **Updated CDN links** - All jsDelivr references now point to correct version (0.3.6)

### Technical Details
- Eliminated duplicate environment detection logic in `generateHashFromDataUrl()`
- Changed `const version = pkg.version` to `const { version } = require(...)`
- Added `// See: __tests__/e2e/duplicate-detection.spec.ts` comments to 3 skipped tests
- Improved code maintainability by consolidating environment checks

## [0.3.5] - 2025-11-07

### Added
- **`getEnvironment()` helper function** - Automatically detects runtime environment (browser/worker/node) and recommends the appropriate API to use
- **Improved error messages** - Error messages now detect Web Worker context and provide specific guidance on using `generateHashFromBlob()` instead of `generateHashFromDataUrl()`
- **Enhanced JSDoc documentation** - All browser APIs now include clear warnings, migration guides, and cross-references
- **Web Worker documentation** - Added comprehensive Web Worker section to README with examples, API comparison table, and migration guide

### Fixed
- Fixed CI test failures on Node.js v20 by properly configuring browser test mocking
- Auto-sync package version from package.json instead of hardcoding (fixes version drift in CDN URLs)
- Fixed browser tests to use Node.js initialization path while mocking only required DOM APIs

### Changed
- Error messages now provide context-specific guidance based on runtime environment (worker vs browser vs Node.js)
- `generateHashFromDataUrl()` error message now detects workers and suggests `generateHashFromBlob()` with example code
- `generateHashFromBlob()` error messages now specify "main thread" when suggesting fallback to `generateHashFromDataUrl()`
- Browser-specific DOM tests now skip in Jest/Node environment and are properly tested in Playwright E2E tests
- Improved test suite reliability across different Node.js versions (18, 20, 22+)
- README now prominently features Web Worker support with quick start guide and API comparison

### Developer Experience
- **Better error messages**: Users trying to use wrong API in workers now get clear, actionable error messages with example code
- **Environment detection**: New `getEnvironment()` API helps developers choose the right function for their context
- **Documentation**: Comprehensive migration guide for users experiencing worker compatibility issues
- **Type safety**: All new exports properly typed with detailed JSDoc comments

### Technical Details
- Version is now dynamically read from package.json in src/pdq.ts
- Browser test mocks simplified to avoid triggering browser code paths during WASM initialization
- 3 browser-specific tests now properly skipped in Node environment (marked with .skip)
- All 85 unit tests pass in Node.js environment
- Full browser functionality validated through Playwright E2E tests
- New `RuntimeEnvironment` interface exported from `pdq-wasm/browser`

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
