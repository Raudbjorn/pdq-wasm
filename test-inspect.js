#!/usr/bin/env node
const createPDQModule = require('./dist/pdq.js');

async function inspect() {
  const Module = await createPDQModule();
  console.log('All Module properties:');
  console.log(Object.keys(Module).sort());
  console.log('\nModule.asm:', typeof Module.asm);
  console.log('Module.wasmMemory:', typeof Module.wasmMemory);

  // Try to find the memory
  for (const key of Object.keys(Module)) {
    const val = Module[key];
    if (val && val.buffer && val.buffer instanceof ArrayBuffer) {
      console.log(`\nFound typed array at Module.${key}:`, val.constructor.name);
    }
  }
}

inspect();
