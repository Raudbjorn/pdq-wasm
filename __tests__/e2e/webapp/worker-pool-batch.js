const WORKER_COUNT = 4;
const BATCH_SIZE = 3; // Process 3 files at a time
const workers = [];
const workerStats = new Map();
let testFiles = [];
let totalFilesCount = 0;
let processedCount = 0;
let failedCount = 0;
let processingCount = 0;
let currentBatch = 0;
let startTime = 0;
let hashTimes = [];
let isProcessing = false;

// Initialize worker pool
async function initWorkers() {
  const workersGrid = document.getElementById('workers-grid');
  workersGrid.innerHTML = '';

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker('./pdq-worker.js');

    workerStats.set(i, {
      id: i,
      status: 'initializing',
      currentFile: null,
      processed: 0,
      errors: 0
    });

    // Create worker UI card
    const card = document.createElement('div');
    card.className = 'worker-card idle';
    card.id = `worker-${i}`;
    card.innerHTML = `
      <div class="worker-header">
        <span>Worker ${i + 1}</span>
        <span class="worker-status idle" id="worker-status-${i}">Init</span>
      </div>
      <div class="worker-info" id="worker-info-${i}">Starting...</div>
    `;
    workersGrid.appendChild(card);

    // Handle worker messages
    worker.onmessage = (event) => {
      handleWorkerMessage(i, event.data);
    };

    worker.onerror = (error) => {
      console.error(`Worker ${i} error:`, error);
      updateWorkerUI(i, 'error', `Error: ${error.message || 'Unknown'}`);
    };

    // Initialize worker
    worker.postMessage({ type: 'init' });

    workers.push(worker);
  }

  console.log(`Initialized ${WORKER_COUNT} workers (batch mode)`);
}

function handleWorkerMessage(workerId, data) {
  const { type, hash, filename, error, duration } = data;

  switch (type) {
    case 'ready':
      workerStats.get(workerId).status = 'idle';
      updateWorkerUI(workerId, 'idle', 'Ready');
      checkAllWorkersReady();
      break;

    case 'hash-result':
      processedCount++;
      processingCount--;
      workerStats.get(workerId).processed++;
      workerStats.get(workerId).status = 'idle';
      workerStats.get(workerId).currentFile = null;

      hashTimes.push(duration);

      addHashResult(filename, hash, workerId, duration);
      updateWorkerUI(workerId, 'idle', `Done: ${filename}`);
      updateStats();

      // Check if current batch is complete
      checkBatchComplete();
      break;

    case 'error':
      failedCount++;
      processingCount--;
      workerStats.get(workerId).errors++;
      workerStats.get(workerId).status = 'error';
      workerStats.get(workerId).currentFile = null;

      console.error(`Worker ${workerId}: ${filename || 'unknown'}: ${error}`);

      updateWorkerUI(workerId, 'error', `Error: ${error}`);
      updateStats();

      // Check if current batch is complete (even with errors)
      checkBatchComplete();
      break;
  }
}

function checkBatchComplete() {
  // If no files are currently processing, start next batch
  if (processingCount === 0 && testFiles.length > 0 && isProcessing) {
    processNextBatch();
  } else if (processingCount === 0 && testFiles.length === 0) {
    // All done
    isProcessing = false;
    console.log('All batches processed!');
    const totalTime = Date.now() - startTime;
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Processed: ${processedCount}, Failed: ${failedCount}`);
  }
}

function processNextBatch() {
  if (testFiles.length === 0 || !isProcessing) {
    return;
  }

  currentBatch++;
  const batchFiles = testFiles.splice(0, BATCH_SIZE);

  console.log(`Processing batch ${currentBatch} (${batchFiles.length} files)`);
  document.getElementById('current-batch').textContent = currentBatch;

  // Assign files to workers
  batchFiles.forEach((file, index) => {
    const workerId = index % WORKER_COUNT;
    processingCount++;

    workerStats.get(workerId).status = 'busy';
    workerStats.get(workerId).currentFile = file.name;

    updateWorkerUI(workerId, 'busy', `Hashing: ${file.name}`);
    updateStats();

    workers[workerId].postMessage({
      type: 'hash',
      data: { file: file.blob, filename: file.name }
    });
  });
}

function checkAllWorkersReady() {
  const allReady = Array.from(workerStats.values()).every(stat => stat.status === 'idle');
  if (allReady) {
    document.getElementById('start-test').disabled = false;
    console.log('All workers ready!');
  }
}

function updateWorkerUI(workerId, status, info) {
  const card = document.getElementById(`worker-${workerId}`);
  const statusEl = document.getElementById(`worker-status-${workerId}`);
  const infoEl = document.getElementById(`worker-info-${workerId}`);

  card.className = `worker-card ${status}`;
  statusEl.className = `worker-status ${status}`;
  statusEl.textContent = status === 'idle' ? 'IDLE' : status === 'busy' ? 'BUSY' : 'ERROR';
  infoEl.textContent = info;
}

function addHashResult(filename, hash, workerId, duration) {
  const hashList = document.getElementById('hash-list');
  const item = document.createElement('div');
  item.className = 'hash-item';
  item.innerHTML = `
    <div>
      <span class="hash-filename">${filename}</span>
      <span class="hash-worker">W${workerId + 1}</span>
      <span class="hash-worker">Batch ${currentBatch}</span>
      <span class="hash-worker">${duration}ms</span>
    </div>
    <span class="hash-value">${hash}</span>
  `;
  hashList.appendChild(item);
}

function updateStats() {
  document.getElementById('processed-files').textContent = processedCount;
  document.getElementById('processing-files').textContent = processingCount;
  document.getElementById('failed-files').textContent = failedCount;

  if (hashTimes.length > 0) {
    const avgTime = Math.round(hashTimes.reduce((a, b) => a + b, 0) / hashTimes.length);
    document.getElementById('avg-time').textContent = `${avgTime}ms`;
  }

  const totalTime = startTime > 0 ? Date.now() - startTime : 0;
  document.getElementById('total-time').textContent = `${totalTime}ms`;

  // Update progress bar
  const progress = totalFilesCount > 0 ? (processedCount + failedCount) / totalFilesCount * 100 : 0;
  document.getElementById('progress-fill').style.width = `${progress}%`;
}

window.startTest = async function() {
  // Load test files
  const fileNames = [
    'red-circle.png',
    'blue-square.png',
    'green-triangle.png',
    'red-circle-copy.png'
  ];

  document.getElementById('start-test').disabled = true;
  testFiles = [];
  window.testFiles = testFiles;
  processedCount = 0;
  failedCount = 0;
  processingCount = 0;
  currentBatch = 0;
  hashTimes = [];
  startTime = Date.now();
  isProcessing = true;
  document.getElementById('hash-list').innerHTML = '';
  document.getElementById('current-batch').textContent = '0';

  // Generate test set - load 12 files (3 batches of 4 workers)
  const replicaCount = 3;

  for (let i = 0; i < replicaCount; i++) {
    for (const fileName of fileNames) {
      try {
        const response = await fetch(`../fixtures/${fileName}`);
        const blob = await response.blob();
        testFiles.push({
          name: `${fileName.replace('.png', '')}-${i + 1}.png`,
          blob
        });
      } catch (error) {
        console.error(`Failed to load ${fileName}:`, error);
      }
    }
  }

  // Set initial total count for accurate progress calculation
  totalFilesCount = testFiles.length;
  document.getElementById('total-files').textContent = totalFilesCount;
  console.log(`Loaded ${totalFilesCount} files for batch processing`);

  // Start processing first batch
  processNextBatch();
};

window.resetTest = function() {
  testFiles = [];
  window.testFiles = testFiles;
  totalFilesCount = 0;
  processedCount = 0;
  failedCount = 0;
  processingCount = 0;
  currentBatch = 0;
  hashTimes = [];
  startTime = 0;
  isProcessing = false;
  document.getElementById('hash-list').innerHTML = '';
  document.getElementById('total-files').textContent = '0';
  document.getElementById('current-batch').textContent = '0';
  updateStats();
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('start-test').disabled = false;
};

// Expose for E2E tests
window.workers = workers;
window.workerStats = workerStats;
window.testFiles = testFiles;
window.getResults = () => ({
  totalFiles: totalFilesCount,
  processed: processedCount,
  failed: failedCount,
  processing: processingCount,
  currentBatch: currentBatch,
  avgTime: hashTimes.length > 0 ? Math.round(hashTimes.reduce((a, b) => a + b, 0) / hashTimes.length) : 0,
  totalTime: startTime > 0 ? Date.now() - startTime : 0
});

// Initialize workers on page load
initWorkers();
console.log('Worker pool initialized (batch mode)');
