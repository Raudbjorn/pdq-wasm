const WORKER_COUNT = 12;
const FILES_PER_WORKER = 3; // Target files-per-worker ratio for workload generation
const workers = [];
const workerStats = new Map();
let testFiles = [];
let totalFilesCount = 0; // Track initial total for accurate progress calculation
let processedCount = 0;
let failedCount = 0;
let processingCount = 0;
let startTime = 0;
let hashTimes = [];
let errorMessages = []; // Track error messages for testing

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
      console.error(`Worker ${i} error details:`, {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        error: error.error
      });
      updateWorkerUI(i, 'error', `Error: ${error.message || 'Unknown'}`);
    };

    // Initialize worker
    worker.postMessage({ type: 'init' });

    workers.push(worker);
  }

  console.log(`Initialized ${WORKER_COUNT} workers`);
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

      // Process next file if available
      processNextFile(workerId);
      break;

    case 'error':
      failedCount++;
      processingCount--;
      workerStats.get(workerId).errors++;
      workerStats.get(workerId).status = 'error';
      workerStats.get(workerId).currentFile = null;

      // Track error message for testing
      const errorMsg = `Worker ${workerId}: ${filename || 'unknown'}: ${error}`;
      errorMessages.push(errorMsg);
      console.error(errorMsg);

      updateWorkerUI(workerId, 'error', `Error: ${error}`);
      updateStats();

      // Process next file despite error
      setTimeout(() => processNextFile(workerId), 1000);
      break;
  }
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

function processNextFile(workerId) {
  if (testFiles.length === 0) {
    // Check if all done
    if (processingCount === 0) {
      console.log('All files processed!');
      const totalTime = Date.now() - startTime;
      console.log(`Total time: ${totalTime}ms`);
      console.log(`Processed: ${processedCount}, Failed: ${failedCount}`);
    }
    return;
  }

  const file = testFiles.shift();
  processingCount++;

  workerStats.get(workerId).status = 'busy';
  workerStats.get(workerId).currentFile = file.name;

  updateWorkerUI(workerId, 'busy', `Hashing: ${file.name}`);
  updateStats();

  workers[workerId].postMessage({
    type: 'hash',
    data: { file: file.blob, filename: file.name }
  });
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
  window.testFiles = testFiles; // Re-expose after reset
  processedCount = 0;
  failedCount = 0;
  processingCount = 0;
  hashTimes = [];
  startTime = Date.now();
  document.getElementById('hash-list').innerHTML = '';

  // Generate test set - replicate files to create workload
  const replicaCount = Math.ceil(WORKER_COUNT * FILES_PER_WORKER / fileNames.length);

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
  console.log(`Loaded ${totalFilesCount} files for processing`);

  // Start processing - distribute to all workers
  for (let i = 0; i < Math.min(WORKER_COUNT, totalFilesCount); i++) {
    processNextFile(i);
  }
};

window.resetTest = function() {
  testFiles = [];
  window.testFiles = testFiles; // Re-expose after reset
  totalFilesCount = 0; // Reset total file count
  processedCount = 0;
  failedCount = 0;
  processingCount = 0;
  hashTimes = [];
  errorMessages = [];
  startTime = 0;
  document.getElementById('hash-list').innerHTML = '';
  document.getElementById('total-files').textContent = '0';
  updateStats();
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('start-test').disabled = false; // Re-enable start button
};

// Expose for E2E tests
window.workers = workers;
window.workerStats = workerStats;
window.testFiles = testFiles; // Expose testFiles for dynamic test injection
window.getResults = () => ({
  totalFiles: testFiles.length + processedCount + failedCount,
  processed: processedCount,
  failed: failedCount,
  processing: processingCount,
  avgTime: hashTimes.length > 0 ? Math.round(hashTimes.reduce((a, b) => a + b, 0) / hashTimes.length) : 0,
  totalTime: startTime > 0 ? Date.now() - startTime : 0
});

/**
 * Inject a test file into the processing queue (for error testing)
 * @param {Object} file - File object with name, type, and data properties
 */
window.injectTestFile = function(file) {
  const blob = new Blob([file.data], { type: file.type });
  testFiles.push({
    name: file.name,
    blob
  });
  // Update total files display
  document.getElementById('total-files').textContent = testFiles.length + processedCount + failedCount;
};

/**
 * Get all error messages collected during processing
 * @returns {string[]} Array of error messages
 */
window.getErrorMessages = () => errorMessages;

/**
 * Manually trigger processing for any remaining files in the queue
 * Useful after dynamically injecting files when workers might be idle
 */
window.triggerProcessing = function() {
  if (testFiles.length === 0) {
    return;
  }

  // Find idle workers and assign them files
  for (let i = 0; i < WORKER_COUNT && testFiles.length > 0; i++) {
    const stat = workerStats.get(i);
    if (stat && stat.status === 'idle') {
      processNextFile(i);
    }
  }
};

// Initialize workers on page load
initWorkers();
console.log('Worker pool initialized');
