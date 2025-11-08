# Web Worker Example

This example demonstrates how to use pdq-wasm in a Web Worker for non-blocking image hashing.

## Features

- **Non-blocking**: Image hashing runs in a separate thread, keeping the UI responsive
- **Worker-compatible APIs**: Uses `PDQ.initWorker()` and `generateHashFromBlob()`
- **Modern browser APIs**: Leverages `createImageBitmap` and `OffscreenCanvas`

## Usage

### 1. Basic Worker Setup

Create a worker file (`pdq-worker.js`):

```javascript
// Import PDQ (using importScripts for classic workers)
importScripts('https://unpkg.com/pdq-wasm@0.3.7/dist/browser.js');

// Initialize PDQ in the worker, with error handling
async function init() {
  try {
    await PDQ.initWorker({
      wasmUrl: 'https://unpkg.com/pdq-wasm@0.3.7/wasm/pdq.wasm'
    });
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: `Failed to initialize: ${error.message}`
    });
  }
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      await init();
      break;

    case 'hash':
      try {
        const hash = await generateHashFromBlob(data.file);
        self.postMessage({
          type: 'hash-result',
          hash,
          filename: data.filename
        });
      } catch (error) {
        self.postMessage({
          type: 'error',
          error: error.message,
          filename: data.filename
        });
      }
      break;
  }
};
```

### 2. Main Thread

```javascript
// Create worker
const worker = new Worker('pdq-worker.js');

// Handle results
worker.onmessage = (event) => {
  const { type, hash, error, filename } = event.data;

  switch (type) {
    case 'ready':
      console.log('Worker ready!');
      break;
    case 'hash-result':
      console.log('Hash:', hash, 'File:', filename);
      break;
    case 'error':
      console.error('Error:', error, 'File:', filename);
      break;
  }
};

// Initialize the worker first
worker.postMessage({ type: 'init' });

// Send file to worker
const file = document.querySelector('input[type="file"]').files[0];
worker.postMessage({
  type: 'hash',
  data: { file, filename: file.name }
});
```

## Running the Example

### Option 1: Local Server

```bash
# From the examples/worker directory
python3 -m http.server 8000
```

Then open http://localhost:8000

### Option 2: Live Server (VS Code)

1. Install the "Live Server" extension
2. Right-click `index.html` and select "Open with Live Server"

## API Reference

### Worker Environment Detection

pdq-wasm automatically detects Web Worker environments:

```javascript
// Detects: typeof self !== 'undefined' && typeof importScripts === 'function'
```

### PDQ.initWorker()

Initialize PDQ in a Web Worker:

```typescript
await PDQ.initWorker({
  wasmUrl: string,           // Required: URL to pdq.wasm
  wasmJsUrl?: string         // Optional: URL to pdq.js (defaults to wasmUrl.replace('.wasm', '.js'))
});
```

### generateHashFromBlob()

Generate hash from a Blob or File (works in both browsers and workers):

```typescript
const hash = await generateHashFromBlob(blob);
```

## Browser Support

Requires modern browsers with:
- Web Workers
- `createImageBitmap`
- `OffscreenCanvas`

Supported in:
- Chrome 69+
- Firefox 105+
- Safari 16.4+
- Edge 79+

## Advanced: Worker Implementation Details

### Recommended: Classic Workers with importScripts()

**Classic workers are the recommended approach** for pdq-wasm because Emscripten generates UMD format JavaScript that cannot be dynamically imported as an ES module.

See the main example above for the correct implementation using `importScripts()`.

### Why Not ES Module Workers?

While ES module workers (`{ type: 'module' }`) are modern and elegant, they have a fundamental incompatibility with Emscripten's output:

- **Emscripten generates UMD format** (`wasm/pdq.js`) which uses `module.exports`
- **Dynamic import expects ES module syntax** with `export` statements
- **Result**: Dynamic import succeeds but returns an empty object

**Solution**: Use classic workers with `importScripts()`, which properly loads UMD modules.

### How PDQ.initWorker() Works

`PDQ.initWorker()` uses `importScripts()` to load the Emscripten-generated UMD module:

1. **Calls `importScripts()`** with the path to `wasm/pdq.js`
2. **Checks for UMD-style exports** (e.g., `self.module.exports` or similar) to access the factory; if not found, **falls back to the global scope**: `self.createPDQModule`
3. **Initializes WASM** by calling the factory function with `locateFile` config
4. **Ready to hash** - worker can now process images

### Logging in Workers

You can enable logging to debug worker initialization:

```javascript
await PDQ.initWorker({
  wasmUrl: 'https://unpkg.com/pdq-wasm@0.3.7/wasm/pdq.wasm',
  logger: (msg) => console.log('[PDQ Worker]', msg)
});
// Logs:
// [PDQ Worker] Initializing PDQ WASM module in Web Worker...
// [PDQ Worker] Loading WASM module from: https://unpkg.com/...
// [PDQ Worker] Loading via importScripts (classic worker)...
// [PDQ Worker] PDQ WASM module initialized successfully (Web Worker)
```

## Performance Benefits

Using Web Workers provides:
- **Non-blocking UI**: Hash computation doesn't freeze the page
- **Parallel processing**: Hash multiple images simultaneously
- **Better UX**: Users can continue interacting while hashing runs

Example with multiple workers:

```javascript
const workerPool = Array(navigator.hardwareConcurrency || 4)
  .fill()
  .map(() => new Worker('pdq-worker.js'));

// Distribute files across workers
files.forEach((file, index) => {
  const worker = workerPool[index % workerPool.length];
  worker.postMessage({ type: 'hash', file });
});
```

## E2E Test Suite

pdq-wasm includes a comprehensive E2E test suite demonstrating a 12-worker pool processing 36 images in parallel:

- **Location**: `__tests__/e2e/worker-pool.spec.ts`
- **Test page**: `__tests__/e2e/webapp/worker.html`
- **Worker implementation**: `__tests__/e2e/webapp/pdq-worker.js`

### Running the E2E Tests

```bash
npm run test:e2e -- worker-pool.spec.ts
```

### What's Tested

The E2E suite validates:
1. ✅ **12 workers initialize successfully** - All workers load and become ready
2. ✅ **Parallel processing** - Multiple workers process files simultaneously
3. ✅ **Work distribution** - Files are evenly distributed across all workers
4. ✅ **Hash consistency** - Duplicate images produce identical hashes
5. ✅ **Performance** - Achieves 3x+ speedup with parallel processing
6. ✅ **Error handling** - Workers handle errors gracefully
7. ✅ **Reset functionality** - Worker pool can be reset and reused

### Performance Metrics

From the E2E tests with 12 workers:
- **36 files processed** in ~60-90ms total
- **4ms average** per file (including overhead)
- **Perfect distribution**: All 12 workers used (3-4 files each)
- **0 errors** - 100% success rate

### Viewing the Test Page

To see the 12-worker pool in action:

```bash
npm run dev
```

Then navigate to: http://localhost:3030/__tests__/e2e/webapp/worker.html

The page provides:
- Real-time worker status display (12 worker cards)
- Processing statistics (files, times, throughput)
- Hash results with per-file timing
- Visual progress tracking
