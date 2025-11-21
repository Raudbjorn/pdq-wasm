import { generateHashFromBlob } from './browser';

/**
 * Options for configuring the WorkerPool
 */
export interface WorkerPoolOptions {
  /** Number of workers to spawn. Defaults to hardware concurrency or 4. */
  size?: number;
  /** URL of the worker script. Required. */
  workerUrl: string;
}

/**
 * Task to be processed by the worker pool
 */
interface WorkerTask {
  image: Blob | File;
  resolve: (hash: string) => void;
  reject: (error: Error) => void;
}

/**
 * Internal worker state
 */
interface WorkerState {
  id: number;
  worker: Worker;
  currentTask: WorkerTask | null;
}

/**
 * WorkerPool manages a pool of Web Workers for efficient image hashing.
 * It reuses workers to avoid the overhead of spawning a new worker for each image.
 */
export class WorkerPool {
  private workers: WorkerState[] = [];
  private taskQueue: WorkerTask[] = [];
  private workerUrl: string;
  private terminated = false;

  /**
   * Create a new WorkerPool
   * @param options Configuration options
   */
  constructor(options: WorkerPoolOptions) {
    this.workerUrl = options.workerUrl;
    const size = options.size || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4);

    for (let i = 0; i < size; i++) {
      this.spawnWorker(i);
    }
  }

  /**
   * Spawn a new worker and add it to the pool
   */
  private spawnWorker(id: number) {
    const worker = new Worker(this.workerUrl);
    
    // Initialize worker
    worker.postMessage({ type: 'init' });

    const workerState: WorkerState = {
      id,
      worker,
      busy: false
    };

    worker.onmessage = (event) => {
      const { type, hash, error } = event.data;

      if (type === 'ready') {
        // Worker is ready, check if we have pending tasks
        // console.log(`Worker ${id} ready`);
        if (!workerState.busy) {
          this.processNextTask(workerState);
        }
      } else if (type === 'hash-result') {
        // Task completed successfully
        const currentTask = (worker as any)._currentTask;
        if (currentTask) {
          currentTask.resolve(hash);
          (worker as any)._currentTask = null;
        }
        workerState.busy = false;
        this.processNextTask(workerState);
      } else if (type === 'error') {
        // Task failed
        const currentTask = (worker as any)._currentTask;
        if (currentTask) {
          currentTask.reject(new Error(error));
          (worker as any)._currentTask = null;
        }
        workerState.busy = false;
        this.processNextTask(workerState);
      }
    };

    worker.onerror = (error) => {
      console.error(`Worker ${id} error:`, error);
      // If a worker crashes, we might want to replace it, but for now just mark it not busy
      // and maybe fail the current task
      const currentTask = (worker as any)._currentTask;
      if (currentTask) {
        currentTask.reject(new Error('Worker error'));
        (worker as any)._currentTask = null;
      }
      workerState.busy = false;
    };

    this.workers.push(workerState);
  }

  /**
   * Process the next task in the queue with the given worker
   */
  private processNextTask(workerState: WorkerState) {
    if (this.terminated) return;
    
    if (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      workerState.busy = true;
      (workerState.worker as any)._currentTask = task;
      
      workerState.worker.postMessage({
        type: 'hash',
        data: {
          file: task.image,
          filename: 'image' // Optional, mostly for debugging in worker
        }
      });
    }
  }

  /**
   * Process an image using the worker pool.
   * @param image Image data (Blob or File)
   * @returns Promise resolving to the PDQ hash
   */
  process(image: Blob | File): Promise<string> {
    if (this.terminated) {
      return Promise.reject(new Error('WorkerPool is terminated'));
    }

    return new Promise((resolve, reject) => {
      const task: WorkerTask = { image, resolve, reject };
      
      // Try to find an idle worker
      const idleWorker = this.workers.find(w => !w.busy);
      
      if (idleWorker) {
        idleWorker.busy = true;
        (idleWorker.worker as any)._currentTask = task;
        idleWorker.worker.postMessage({
          type: 'hash',
          data: {
            file: image,
            filename: 'image'
          }
        });
      } else {
        // Queue the task
        this.taskQueue.push(task);
      }
    });
  }

  /**
   * Terminate all workers in the pool.
   */
  terminate(): void {
    this.terminated = true;
    this.workers.forEach(w => w.worker.terminate());
    this.workers = [];
    this.taskQueue = [];
  }
}
