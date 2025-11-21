import { WorkerPool } from '../src/index';

// Example usage of WorkerPool
async function main() {
  console.log('Initializing WorkerPool...');
  
  // Create a pool with 4 workers
  // Note: In a real app, you'd point to the actual worker script URL
  const pool = new WorkerPool({
    size: 4,
    workerUrl: './worker/pdq-worker.js' 
  });

  console.log('WorkerPool initialized. Processing images...');

  // Simulate some image blobs (in a real app these would be actual files)
  // Since we can't easily create Blobs in Node.js without polyfills, 
  // this example is mainly for structural demonstration or browser usage.
  // For the purpose of this example, we'll assume we're in a browser environment
  // or have the necessary polyfills.
  
  if (typeof Blob !== 'undefined') {
    const images = [
      new Blob(['fake image data 1']),
      new Blob(['fake image data 2']),
      new Blob(['fake image data 3']),
      new Blob(['fake image data 4']),
      new Blob(['fake image data 5']),
    ];

    try {
      const promises = images.map((img, index) => {
        return pool.process(img)
          .then(hash => console.log(`Image ${index} hash: ${hash}`))
          .catch(err => console.error(`Image ${index} error:`, err));
      });

      await Promise.all(promises);
      console.log('All images processed.');
    } catch (error) {
      console.error('Error processing images:', error);
    }
  } else {
    console.log('This example requires a browser environment with Blob support.');
  }

  // Clean up
  pool.terminate();
  console.log('WorkerPool terminated.');
}

// Run if in a browser environment
if (typeof window !== 'undefined') {
  main();
}
