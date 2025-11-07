#!/usr/bin/env node
/**
 * Update version numbers in example files
 * Run this script after updating package.json version
 */

const fs = require('fs');
const path = require('path');

// Read version from package.json
const packageJson = require('../package.json');
const version = packageJson.version;

console.log(`Updating examples to version ${version}...`);

// Files to update
const filesToUpdate = [
  'examples/worker/pdq-worker.js',
  'examples/worker/README.md',
  'examples/browser/index.html',
  'README.md'
];

let filesUpdated = 0;

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, '..', file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${file}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Replace version in unpkg URLs
  // Match patterns like: @0.3.3, @latest, or @x.x.x
  content = content.replace(
    /unpkg\.com\/pdq-wasm@[\d.]+/g,
    `unpkg.com/pdq-wasm@${version}`
  );

  // Also replace @latest with specific version for security
  content = content.replace(
    /unpkg\.com\/pdq-wasm@latest/g,
    `unpkg.com/pdq-wasm@${version}`
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Updated: ${file}`);
    filesUpdated++;
  } else {
    console.log(`- No changes: ${file}`);
  }
});

console.log(`\n✓ Updated ${filesUpdated} file(s) to version ${version}`);
