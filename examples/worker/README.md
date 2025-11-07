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
importScripts('https://unpkg.com/pdq-wasm@0.3.3/dist/browser.js');

// Initialize PDQ in the worker
async function init() {
  await PDQ.initWorker({
    wasmUrl: 'https://unpkg.com/pdq-wasm@0.3.3/wasm/pdq.wasm'
  });
  self.postMessage({ type: 'ready' });
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, file } = event.data;

  if (type === 'hash') {
    try {
      const hash = await generateHashFromBlob(file);
      self.postMessage({ type: 'result', hash });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  }
};

init();
```

### 2. Main Thread

```javascript
// Create worker
const worker = new Worker('pdq-worker.js');

// Handle results
worker.onmessage = (event) => {
  const { type, hash, error } = event.data;

  if (type === 'ready') {
    console.log('Worker is ready');
  } else if (type === 'result') {
    console.log('Hash:', hash);
  } else if (type === 'error') {
    console.error('Error:', error);
  }
};

// Send file to worker
const file = document.querySelector('input[type="file"]').files[0];
worker.postMessage({ type: 'hash', file });
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

## Advanced: ES Module Workers

For ES module workers, use dynamic import:

```javascript
// pdq-worker.mjs
import PDQ from 'pdq-wasm';

await PDQ.initWorker({
  wasmUrl: '/wasm/pdq.wasm'
});

self.onmessage = async (event) => {
  // ... handle messages
};
```

Main thread:

```javascript
const worker = new Worker('pdq-worker.mjs', { type: 'module' });
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
