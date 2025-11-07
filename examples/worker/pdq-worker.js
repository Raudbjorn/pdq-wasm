/**
 * Example Web Worker for PDQ hashing
 *
 * This worker demonstrates how to use pdq-wasm in a Web Worker environment.
 * It loads the WASM module and processes image files sent from the main thread.
 */

// Import PDQ in the worker
// Note: In a real application, you would use importScripts or ES module imports
// For this example, we'll use importScripts to load from CDN
importScripts('https://unpkg.com/pdq-wasm@latest/dist/browser.js');

// Initialize PDQ in the worker
async function init() {
  try {
    await PDQ.initWorker({
      wasmUrl: 'https://unpkg.com/pdq-wasm@latest/wasm/pdq.wasm'
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

  switch (type) {
    case 'init':
      await init();
      break;

    case 'hash':
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

// Auto-initialize
init();
