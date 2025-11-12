# Service Worker Support

The browser examples now include service worker support for offline functionality and improved performance through caching.

## Features

- **Offline Support**: Once loaded, the examples can work offline
- **Automatic Caching**: Application files, JavaScript modules, and WASM files are cached automatically
- **Cache-First Strategy**: Resources are served from cache when available, falling back to network
- **Automatic Updates**: Old caches are cleaned up when a new version is deployed

## How It Works

### Browser Example

The browser example (`examples/browser/`) includes a service worker that:

1. Caches the HTML page, JavaScript modules, and WASM binary on first load
2. Serves cached resources for faster subsequent loads
3. Enables the app to work offline after the first visit
4. Automatically updates the cache when files change

### Worker Example

The worker example (`examples/worker/`) includes similar functionality, also caching the Web Worker script (`pdq-worker.js`) for offline use.

## Using the Examples with Service Workers

### Starting the Examples

Service workers require HTTPS or localhost. To test locally:

```bash
# From the pdq-wasm root directory
cd examples/browser  # or examples/worker

# Start a local server (choose one):
npx serve .
# or
python -m http.server 8000
# or
python3 -m http.server 8000
```

Then open your browser to `http://localhost:8000` (or the appropriate port).

### Verifying Service Worker Registration

1. Open the example in your browser
2. Open Developer Tools (F12)
3. Check the Console tab - you should see:
   ```
   ✓ Service Worker registered successfully: http://localhost:8000/
   ```
4. Go to the Application tab (Chrome) or Storage tab (Firefox)
5. Click on "Service Workers" to see the registered worker
6. Click on "Cache Storage" to see cached resources

### Testing Offline Functionality

1. Load the example page with internet/server running
2. Upload and hash some images to verify it works
3. In Developer Tools > Application > Service Workers, check "Offline"
4. Refresh the page
5. The application should still load and work (though you can't upload new images while offline)

## Service Worker Cache Management

### Cache Names

- Browser example: `pdq-wasm-browser-v1`
- Worker example: `pdq-wasm-worker-v1`

### Cached Resources

Each service worker caches:
- The HTML page (`index.html`)
- JavaScript modules (`../../dist/esm/index.js`)
- WASM binary (`../../wasm/pdq.wasm`)
- Worker example also caches: `pdq-worker.js`

### Cache Updates

When you update the service worker code (e.g., change the `CACHE_NAME`), the browser will:
1. Install the new service worker
2. Activate it after all tabs using the old version are closed
3. Delete old caches automatically

To force an update:
1. Open Developer Tools
2. Go to Application > Service Workers
3. Click "Update" or "Unregister" to force a refresh

## Development Considerations

### Debugging

During development, you may want to:

1. **Bypass service worker**: In DevTools > Application > Service Workers, check "Bypass for network"
2. **Clear cache**: In DevTools > Application > Cache Storage, right-click and delete caches
3. **Unregister**: In DevTools > Application > Service Workers, click "Unregister"

### Cache Versioning

When deploying updates, increment the cache version in `service-worker.js`:

```javascript
const CACHE_NAME = 'pdq-wasm-browser-v2'; // Increment version number
```

This ensures users get the latest files and old caches are cleaned up.

## Browser Compatibility

Service workers are supported in:
- Chrome/Edge 40+
- Firefox 44+
- Safari 11.1+
- Opera 27+

The service worker registration code includes a check (`'serviceWorker' in navigator`) to ensure compatibility.

## Security Notes

Service workers:
- Only work on HTTPS or localhost for security
- Cannot access the DOM directly
- Run in a separate thread from the main page
- Have a defined scope (by default, the directory where they're located)

## Further Reading

- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Google: Service Worker Introduction](https://developers.google.com/web/fundamentals/primers/service-workers)
- [MDN: Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
