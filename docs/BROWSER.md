# Browser Utilities

PDQ-WASM provides specialized browser utilities for common web application tasks like duplicate detection, hash management, and real-time image processing. These utilities are browser-only and use DOM APIs (Canvas, Image, etc.).

## Installation & Import

```bash
npm install pdq-wasm
```

```javascript
import {
  createHashChecker,
  hammingDistance,
  generateHashFromDataUrl,
  detectDuplicatesByHash
} from 'pdq-wasm/browser';
```

## Table of Contents

- [createHashChecker](#createhashchecker) - Hash existence checking with caching
- [hammingDistance](#hammingdistance) - Hex hash comparison
- [generateHashFromDataUrl](#generatehashfromdataurl) - Hash from data/blob URLs
- [detectDuplicatesByHash](#detectduplicatesbyhash) - Batch duplicate detection

---

## createHashChecker

Create a hash existence checker with custom lookup function. Supports chainable modifiers for caching and error handling.

### Signature

```typescript
function createHashChecker(
  lookup: (hash: string) => Promise<HashLookupResult>
): HashChecker
```

### Parameters

- **lookup**: `(hash: string) => Promise<HashLookupResult>`
  Function that checks if a hash exists in your storage system

### Returns

`HashChecker` function with chainable methods:
- `.ignoreInvalid()` - Return `{exists: false}` for invalid hashes instead of throwing
- `.cached(ttl?, maxSize?)` - Enable result caching with optional TTL (ms) and max size
  - Uses LRU (Least Recently Used) eviction when cache is full
  - Default max size: 1000 entries
  - Default TTL: Infinity (cache forever)
- `.clearCache()` - Clear the cache (only available on cached checkers)

### Basic Usage

```javascript
const checkHash = createHashChecker(async (hash) => {
  // Supabase example
  const { data } = await supabase
    .from('images')
    .select('*')
    .eq('pdq_hash', hash)
    .single();

  return {
    exists: !!data,
    existing: data  // Optional: include existing record data
  };
});

// Check if hash exists
const result = await checkHash(myPDQHash);
console.log(result.exists);        // true or false
console.log(result.existing);      // the existing record if found
```

### With REST API

```javascript
const checkHash = createHashChecker(async (hash) => {
  const response = await fetch(`/api/hashes/${hash}`);

  if (response.status === 404) {
    return { exists: false };
  }

  const data = await response.json();
  return {
    exists: true,
    existing: data
  };
});
```

### With Caching

```javascript
// Cache results for 5 minutes, max 500 entries
const checkHash = createHashChecker(lookup)
  .cached(5 * 60 * 1000, 500);

// First call hits the database
await checkHash(hash1);  // Database query

// Second call within 5 minutes uses cached result
await checkHash(hash1);  // From cache

// Clear cache when needed (e.g., after bulk update)
checkHash.clearCache();
```

### With ignoreInvalid

```javascript
// Gracefully handle invalid hashes
const checkHash = createHashChecker(lookup)
  .ignoreInvalid();

// Invalid hash returns { exists: false } instead of throwing
const result = await checkHash('invalid');
console.log(result.exists);  // false
```

### Combined Example

```javascript
// Combine caching + error handling
const checkHash = createHashChecker(lookup)
  .ignoreInvalid()  // Don't throw on invalid hashes
  .cached(60 * 60 * 1000);  // Cache for 1 hour

// Use in batch processing
const results = await Promise.all(
  hashes.map(hash => checkHash(hash))
);

// Clean up cache later
checkHash.clearCache();
```

### Use Cases

- **Upload prevention**: Check if image hash exists before allowing upload
- **Deduplication**: Identify duplicate uploads in real-time
- **Offline-first apps**: Cache hash lookups for better performance
- **Batch processing**: Process many files with cached lookups

---

## hammingDistance

Calculate Hamming distance between two PDQ hash strings (hex format). Convenience wrapper around `PDQ.hammingDistance()` that works directly with hex strings.

### Signature

```typescript
function hammingDistance(hash1: string, hash2: string): number
```

### Parameters

- **hash1**: `string` - First PDQ hash (64 hex characters)
- **hash2**: `string` - Second PDQ hash (64 hex characters)

### Returns

`number` - Hamming distance from 0 (identical) to 256 (completely different)

### Usage

```javascript
const hash1 = 'a1b2c3d4e5f6...'; // 64 hex characters
const hash2 = 'a1b2c3d4ffff...'; // 64 hex characters

const distance = hammingDistance(hash1, hash2);
console.log(`Distance: ${distance} bits`);

// Check for duplicates (threshold: 31)
if (distance <= 31) {
  console.log('Images are likely duplicates');
}
```

### Threshold Guide

Recommended Hamming distance thresholds:

- **0-10**: Nearly identical (exact matches, minor compression differences)
- **11-20**: Very similar (minor edits, crops, filters)
- **21-31**: Similar (common threshold for duplicates)
- **32-50**: Somewhat similar
- **50+**: Different images

These values depend on your use case. Experiment to find the right threshold for your application.

### Error Handling

```javascript
try {
  const distance = hammingDistance(hash1, hash2);
} catch (error) {
  console.error('Invalid hash format');
}
```

Throws if:
- Either hash is not exactly 64 characters
- Either hash contains non-hexadecimal characters

---

## generateHashFromDataUrl

Generate PDQ perceptual hash from an image data URL or blob URL. Uses Canvas API for image processing.

**Memory Management:** Blob URLs can be automatically revoked after processing using the `autoRevoke` parameter to prevent memory leaks. This is useful when you don't need the blob URL for preview display. Data URLs are never affected.

### Signature

```typescript
function generateHashFromDataUrl(
  dataUrl: string,
  autoRevoke?: boolean
): Promise<string>
```

### Parameters

- **dataUrl**: `string` - Image data URL (`data:image/...`) or blob URL (`blob:...`)
- **autoRevoke**: `boolean` - Automatically revoke blob URLs after processing (default: `false`)

### Returns

`Promise<string>` - 64-character hex PDQ hash

### From File Input (Blob URLs)

**With Auto-Revoke (Recommended for simple cases):**

```javascript
const fileInput = document.querySelector('input[type="file"]');

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const blobUrl = URL.createObjectURL(file);

  // Auto-revoke: blob URL cleaned up automatically after hashing
  const hash = await generateHashFromDataUrl(blobUrl, true);
  console.log(`PDQ Hash: ${hash}`);

  // Use hash (check for duplicates, store, etc.)
  await checkForDuplicate(hash);
});
```

**Without Auto-Revoke (When you need the blob URL for display):**

```javascript
const fileInput = document.querySelector('input[type="file"]');

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const blobUrl = URL.createObjectURL(file);

  try {
    const hash = await generateHashFromDataUrl(blobUrl);
    console.log(`PDQ Hash: ${hash}`);

    // Display image preview using the same blob URL
    document.querySelector('img').src = blobUrl;

    // Use hash (check for duplicates, store, etc.)
    await checkForDuplicate(hash);

  } finally {
    // ⚠️ IMPORTANT: Manually revoke when you're done with the blob URL
    // (e.g., when component unmounts or image is replaced)
    URL.revokeObjectURL(blobUrl);
  }
});
```

### From Canvas (Data URLs)

```javascript
// Data URLs don't need cleanup
const canvas = document.getElementById('myCanvas');
const dataUrl = canvas.toDataURL('image/png');

const hash = await generateHashFromDataUrl(dataUrl);
console.log(`Hash: ${hash}`);
```

### From Image Element

```javascript
async function hashImageElement(img) {
  // Convert image to canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  return await generateHashFromDataUrl(dataUrl);
}

const img = document.querySelector('img');
const hash = await hashImageElement(img);
```

### Error Handling

```javascript
try {
  const hash = await generateHashFromDataUrl(blobUrl);
} catch (error) {
  if (error.message === 'Failed to load image') {
    console.error('Invalid or corrupted image');
  } else if (error.message.includes('browser environment')) {
    console.error('Can only be used in browsers');
  }
}
```

Throws if:
- Called in non-browser environment (no `window` or `document`)
- Image fails to load (invalid URL, CORS error, etc.)
- Canvas context cannot be obtained

### Technical Details

- Automatically converts RGBA (Canvas) to RGB (PDQ format)
- Preserves original image dimensions
- Handles cross-origin images with `crossOrigin = 'anonymous'`
- Works with any image format supported by the browser
- Auto-revoke feature only affects blob URLs (`blob:...`), never data URLs (`data:image/...`)
- Auto-revoke happens after successful hash generation or on any error path

---

## detectDuplicatesByHash

Detect duplicate images by comparing PDQ perceptual hashes. Generates hashes for all files and groups similar images together.

### Signature

```typescript
function detectDuplicatesByHash(
  files: FileWithHash[],
  threshold?: number,
  onProgress?: ProgressCallback
): Promise<FileWithHash[][]>
```

### Parameters

- **files**: `FileWithHash[]` - Array of files with preview URLs
- **threshold**: `number` - Hamming distance threshold (default: 31, PDQ recommended)
- **onProgress**: `ProgressCallback` - Optional callback for progress updates

### Returns

`Promise<FileWithHash[][]>` - Array of duplicate groups (only groups with 2+ files)

### Basic Usage

```javascript
const files = [
  { id: '1', name: 'photo1.jpg', preview: 'blob:...', type: 'image/jpeg' },
  { id: '2', name: 'photo2.jpg', preview: 'blob:...', type: 'image/jpeg' },
  { id: '3', name: 'photo1-copy.jpg', preview: 'blob:...', type: 'image/jpeg' }
];

const duplicates = await detectDuplicatesByHash(files);

// Display results
duplicates.forEach((group, index) => {
  console.log(`Duplicate Group ${index + 1} (${group.length} files):`);
  group.forEach(file => {
    console.log(`  - ${file.name}`);
    console.log(`    Hash: ${file.meta.hash}`);
  });
});
```

### With Progress Tracking

```javascript
const duplicates = await detectDuplicatesByHash(
  files,
  31,  // threshold
  (progress) => {
    // Update UI
    const percent = (progress.processedFiles / progress.totalFiles) * 100;
    updateProgressBar(percent);

    console.log(`Processing: ${progress.currentFile}`);
    console.log(`Progress: ${progress.processedFiles}/${progress.totalFiles}`);
    console.log(`Duplicates found: ${progress.duplicatesFound}`);
  }
);
```

### Complete Example with UI

```javascript
async function findDuplicates(fileInputElement) {
  const files = Array.from(fileInputElement.files).map(file => ({
    id: crypto.randomUUID(),
    name: file.name,
    preview: URL.createObjectURL(file),
    type: file.type
  }));

  try {
    // Show progress
    const progressEl = document.getElementById('progress');
    const statusEl = document.getElementById('status');

    const duplicates = await detectDuplicatesByHash(
      files,
      31,
      (progress) => {
        const percent = (progress.processedFiles / progress.totalFiles) * 100;
        progressEl.value = percent;
        statusEl.textContent = `Processing: ${progress.currentFile} (${progress.duplicatesFound} duplicates found)`;
      }
    );

    // Display results
    if (duplicates.length === 0) {
      statusEl.textContent = 'No duplicates found!';
    } else {
      statusEl.textContent = `Found ${duplicates.length} duplicate groups`;
      displayDuplicateGroups(duplicates);
    }

  } finally {
    // Clean up blob URLs
    files.forEach(file => URL.revokeObjectURL(file.preview));
  }
}
```

### Custom Threshold

```javascript
// Stricter detection (fewer false positives)
const duplicates = await detectDuplicatesByHash(files, 15);

// More lenient detection (catches more variations)
const duplicates = await detectDuplicatesByHash(files, 50);
```

### FileWithHash Interface

```typescript
interface FileWithHash {
  id: string;           // Unique identifier
  name: string;         // File name
  preview: string;      // Data URL or blob URL
  type: string;         // MIME type
  meta?: {
    hash?: string | null;      // PDQ hash (64 hex chars) or null if failed
    hashError?: string;        // Error message if hashing failed
    isSelected?: boolean;      // Optional: selection state
    location?: string;         // Optional: file path
    note?: string;            // Optional: user note
  };
}
```

### ProgressCallback Interface

```typescript
interface DetectionProgress {
  totalFiles: number;        // Total number of files to process
  processedFiles: number;    // Number of files processed so far
  currentFile: string;       // Name of file currently being processed
  duplicatesFound: number;   // Number of duplicates found so far
}

type ProgressCallback = (progress: DetectionProgress) => void;
```

### Use Cases

- **Pre-upload deduplication**: Detect duplicates before uploading to server
- **Photo library cleanup**: Find and remove duplicate photos
- **Content moderation**: Identify near-duplicate user-uploaded images
- **Backup verification**: Ensure backups don't contain duplicates
- **Gallery organization**: Group similar photos for user review

### Performance Tips

1. **Use progress callbacks** for better UX with large file sets
2. **Process in batches** for very large sets (1000+ files)
3. **Show thumbnails** from `preview` URLs while processing
4. **Remember to revoke blob URLs** when done to prevent memory leaks

---

## Complete Integration Example

Here's a complete example showing all browser utilities working together:

```javascript
import { PDQ } from 'pdq-wasm';
import {
  createHashChecker,
  hammingDistance,
  generateHashFromDataUrl,
  detectDuplicatesByHash
} from 'pdq-wasm/browser';

// Initialize PDQ
await PDQ.init({
  wasmUrl: '/wasm/pdq.wasm'
});

// Create cached hash checker
const checkHash = createHashChecker(async (hash) => {
  const response = await fetch(`/api/hashes/${hash}`);
  return response.json();
})
  .ignoreInvalid()
  .cached(5 * 60 * 1000);  // 5-minute cache

// Handle file uploads
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files).map(file => ({
    id: crypto.randomUUID(),
    name: file.name,
    preview: URL.createObjectURL(file),
    type: file.type
  }));

  try {
    // Find duplicates
    const duplicates = await detectDuplicatesByHash(
      files,
      31,
      (progress) => {
        updateProgressUI(progress);
      }
    );

    if (duplicates.length > 0) {
      alert(`Found ${duplicates.length} duplicate groups!`);
      displayDuplicates(duplicates);
      return;
    }

    // Check against existing hashes
    for (const file of files) {
      if (file.meta?.hash) {
        const result = await checkHash(file.meta.hash);

        if (result.exists) {
          alert(`${file.name} already exists!`);
          console.log('Existing record:', result.existing);
        } else {
          // Upload new file
          await uploadFile(file);
        }
      }
    }

  } finally {
    // Clean up
    files.forEach(file => URL.revokeObjectURL(file.preview));
    checkHash.clearCache?.();
  }
});

function updateProgressUI(progress) {
  document.getElementById('progress').value =
    (progress.processedFiles / progress.totalFiles) * 100;
  document.getElementById('status').textContent =
    `Processing: ${progress.currentFile}`;
}
```

---

## Browser Compatibility

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 15+, Edge 90+
- **Required APIs**:
  - Canvas API (for image processing)
  - ES Modules (for imports)
  - WebAssembly (for PDQ hashing)
  - Promise (for async operations)
  - Map/Set (for LRU cache)

## Error Handling Best Practices

```javascript
// Wrap in try-catch
try {
  const hash = await generateHashFromDataUrl(blobUrl);
  const result = await checkHash(hash);

  if (result.exists) {
    handleDuplicate(result.existing);
  }
} catch (error) {
  if (error.message.includes('Invalid PDQ hash')) {
    console.error('Hash validation failed');
  } else if (error.message.includes('Failed to load image')) {
    console.error('Image processing failed');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## See Also

- [PostgreSQL Integration](./POSTGRESQL.md) - Storing and querying hashes in PostgreSQL
- [Main README](../README.md) - Core PDQ API documentation
- [Examples](../examples/) - Complete working examples
