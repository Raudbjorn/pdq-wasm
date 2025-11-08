/**
 * PDQ Worker - Classic Worker Version
 * Uses importScripts() to load the Emscripten UMD output
 *
 * This worker processes image hashing in a background thread.
 * It's designed as a classic worker (not ES module) to support importScripts().
 */

let pdqModule = null;
let initialized = false;

console.log('[PDQ Worker] Starting initialization...');

/**
 * Initialize the PDQ WASM module
 */
async function initializePDQ() {
  try {
    console.log('[PDQ Worker] Loading Emscripten UMD factory...');
    console.log('[PDQ Worker] Worker location:', self.location.href);

    // Load the Emscripten UMD factory using importScripts
    // This makes createPDQModule available globally
    try {
      const wasmJsPath = new URL('../../../wasm/pdq.js', self.location.href).href;
      console.log('[PDQ Worker] Loading from:', wasmJsPath);

      importScripts(wasmJsPath);
      console.log('[PDQ Worker] importScripts completed');
    } catch (importError) {
      console.error('[PDQ Worker] importScripts failed:', importError);
      throw new Error(`Failed to load WASM factory: ${importError.message}`);
    }

    // Check if createPDQModule is available
    if (typeof createPDQModule !== 'function') {
      console.error('[PDQ Worker] createPDQModule not found on global scope');
      console.error('[PDQ Worker] Available globals:', Object.keys(self).filter(k => !k.startsWith('_')).slice(0, 20));
      throw new Error('createPDQModule is not defined. Check Emscripten output.');
    }

    console.log('[PDQ Worker] createPDQModule found, initializing module...');

    // Initialize the WASM module
    const wasmPath = new URL('../../../wasm/pdq.wasm', self.location.href).href;
    pdqModule = await createPDQModule({
      locateFile: (path) => {
        if (path.endsWith('.wasm')) {
          console.log('[PDQ Worker] Locating WASM file:', wasmPath);
          return wasmPath;
        }
        return path;
      }
    });

    console.log('[PDQ Worker] PDQ module initialized successfully');
    initialized = true;

    // Notify parent that we're ready
    self.postMessage({ type: 'ready' });

  } catch (error) {
    console.error('[PDQ Worker] Initialization failed:', error);
    self.postMessage({
      type: 'error',
      error: `Initialization failed: ${error.message}`
    });
  }
}

/**
 * Generate hash from image blob
 */
async function generateHash(imageBlob) {
  if (!pdqModule) {
    throw new Error('PDQ module not initialized');
  }

  // Convert blob to ImageData
  const bitmap = await createImageBitmap(imageBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgbaData = imageData.data;

  // Convert RGBA to RGB (Uint8Array)
  const numPixels = canvas.width * canvas.height;
  const rgbData = new Uint8Array(numPixels * 3);

  for (let i = 0; i < numPixels; i++) {
    const srcIdx = i * 4;
    const dstIdx = i * 3;
    rgbData[dstIdx] = rgbaData[srcIdx];       // R
    rgbData[dstIdx + 1] = rgbaData[srcIdx + 1]; // G
    rgbData[dstIdx + 2] = rgbaData[srcIdx + 2]; // B
  }

  // Allocate memory in WASM
  const inputPtr = pdqModule._malloc(rgbData.length);
  const hashPtr = pdqModule._malloc(32); // PDQ hash is 32 bytes

  try {
    // Copy RGB data to WASM memory
    pdqModule.HEAPU8.set(rgbData, inputPtr);

    // Call the PDQ hash function
    pdqModule._pdq_hash_from_rgb(
      inputPtr,
      canvas.width,
      canvas.height,
      hashPtr
    );

    // Read the hash from WASM memory
    const hashBytes = new Uint8Array(pdqModule.HEAPU8.buffer, hashPtr, 32);
    const hashArray = Array.from(hashBytes);

    // Convert to hex string
    const hexString = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

    return hexString;

  } finally {
    // Free allocated memory
    pdqModule._free(inputPtr);
    pdqModule._free(hashPtr);
  }
}

/**
 * Message handler
 */
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      // Initialize the module
      await initializePDQ();
      break;

    case 'hash':
      if (!initialized) {
        self.postMessage({
          type: 'error',
          error: 'Worker not initialized',
          filename: data.filename
        });
        return;
      }

      try {
        const startTime = performance.now();
        const hash = await generateHash(data.file);
        const duration = Math.round(performance.now() - startTime);

        self.postMessage({
          type: 'hash-result',
          hash,
          filename: data.filename,
          duration
        });
      } catch (error) {
        console.error('[PDQ Worker] Hash generation failed:', error);
        self.postMessage({
          type: 'error',
          error: error.message,
          filename: data.filename
        });
      }
      break;

    default:
      console.warn('[PDQ Worker] Unknown message type:', type);
  }
});

/**
 * Error handlers
 */
self.addEventListener('error', (error) => {
  console.error('[PDQ Worker] Uncaught error:', error);
  self.postMessage({
    type: 'error',
    error: {
      message: error.message,
      filename: error.filename,
      lineno: error.lineno
    }
  });
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[PDQ Worker] Unhandled rejection:', event.reason);
  self.postMessage({
    type: 'error',
    error: {
      message: `Unhandled rejection: ${event.reason}`
    }
  });
});

console.log('[PDQ Worker] Worker script loaded, waiting for init message');
