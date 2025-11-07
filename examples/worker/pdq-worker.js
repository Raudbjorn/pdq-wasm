/**
 * Example Web Worker for PDQ hashing
 *
 * This worker demonstrates how to use pdq-wasm in a Web Worker environment.
 * It loads the WASM module and processes image files sent from the main thread.
 */

// Import PDQ in the worker
// SECURITY NOTE: For production, self-host the files instead of using CDN
// This example uses a pinned version for reproducibility
// Version is auto-updated by `npm version` command via scripts/update-version-in-examples.js
importScripts('https://unpkg.com/pdq-wasm@0.3.8/dist/browser.js');

// Initialize PDQ in the worker
async function init() {
  try {
    await PDQ.initWorker({
      // Pin to specific version to ensure reproducibility and security
      wasmUrl: 'https://unpkg.com/pdq-wasm@0.3.8/wasm/pdq.wasm'
    });
    console.log('PDQ initialized in worker');
    self.postMessage({ type: 'ready' });
  } catch (error) {
    console.error('Failed to initialize PDQ:', error);
    self.postMessage({ type: 'error', error: error.message });
  }
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, data } = event.data;

  // Validate message structure
  if (typeof type !== 'string') {
    self.postMessage({
      type: 'error',
      error: 'Invalid message format'
    });
    return;
  }

  switch (type) {
    case 'init':
      await init();
      break;

    case 'hash':
      // Validate input
      if (!data || !(data.file instanceof Blob)) {
        self.postMessage({
          type: 'error',
          error: 'Invalid file object',
          filename: data?.filename
        });
        return;
      }

      // Add size limit to prevent DOS attacks
      const MAX_SIZE = 50 * 1024 * 1024; // 50MB
      if (data.file.size > MAX_SIZE) {
        self.postMessage({
          type: 'error',
          error: `File too large: ${(data.file.size / 1024 / 1024).toFixed(1)}MB (max: 50MB)`,
          filename: data.filename
        });
        return;
      }

      try {
        // Use generateHashFromBlob which works in workers
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

    default:
      self.postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`
      });
  }
};
