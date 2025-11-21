import { WorkerPool } from '../src/worker-pool';

// Mock Worker
class MockWorker {
  onmessage: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  
  constructor(public url: string) {
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({ data: { type: 'ready' } });
      }
    }, 10);
  }

  postMessage(msg: any) {
    if (msg.type === 'init') return;
    
    if (msg.type === 'hash') {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({ 
            data: { 
              type: 'hash-result', 
              hash: '0000000000000000000000000000000000000000000000000000000000000000',
              filename: msg.data.filename
            } 
          });
        }
      }, 50);
    }
  }

  terminate() {}
}

// Force MockWorker usage
global.Worker = MockWorker as any;

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool({
      size: 2,
      workerUrl: 'mock-worker.js'
    });
  });

  afterEach(() => {
    pool.terminate();
  });

  test('should process a single image', async () => {
    const blob = new Blob(['fake data']);
    const hash = await pool.process(blob);
    expect(hash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  test('should process multiple images concurrently', async () => {
    const blobs = [
      new Blob(['1']),
      new Blob(['2']),
      new Blob(['3']),
      new Blob(['4'])
    ];

    const start = Date.now();
    const hashes = await Promise.all(blobs.map(b => pool.process(b)));
    const duration = Date.now() - start;

    expect(hashes.length).toBe(4);
    hashes.forEach(h => expect(h).toBe('0000000000000000000000000000000000000000000000000000000000000000'));
    
    // With 2 workers and ~50ms per task, 4 tasks should take ~100ms (2 batches)
    // This is a rough check to ensure parallelism is happening
    // Ideally it should be < 200ms (sequential would be ~200ms)
    expect(duration).toBeLessThan(180); 
  });
});
