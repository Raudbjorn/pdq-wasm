#!/usr/bin/env node
/**
 * Build ESM (ES Module) version alongside CommonJS
 * This creates a proper dual-build setup for the package
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Validate that a directory path is safe (no traversal attacks)
 * @param {string} dirPath - Directory path to validate
 * @param {string} basePath - Base path that dir must be within
 * @throws {Error} if path is unsafe
 */
function validatePath(dirPath, basePath) {
  const resolvedDir = path.resolve(dirPath);
  const resolvedBase = path.resolve(basePath);

  // Ensure the resolved path is within the base path
  if (!resolvedDir.startsWith(resolvedBase)) {
    throw new Error(`Path traversal detected: ${dirPath} is outside ${basePath}`);
  }

  return resolvedDir;
}

function addJsExtensions(dir, basePath) {
  // Validate path before any fs operations
  const safePath = validatePath(dir, basePath);
  const files = fs.readdirSync(safePath);

  for (const file of files) {
    const filePath = path.join(safePath, file);
    // Validate joined path
    validatePath(filePath, basePath);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      addJsExtensions(filePath, basePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');

      // Add .js extension to relative imports
      // Match: from './something' or from "./something"
      // Don't match: from '../wasm/pdq.js' (already has extension)
      content = content.replace(
        /from\s+(['"])(\..+?)\1/g,
        (match, quote, importPath) => {
          // Skip if already has an extension
          if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
            return match;
          }
          return `from ${quote}${importPath}.js${quote}`;
        }
      );

      // Also handle export { ... } from './something'
      content = content.replace(
        /}\s+from\s+(['"])(\..+?)\1/g,
        (match, quote, importPath) => {
          if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
            return match;
          }
          return `} from ${quote}${importPath}.js${quote}`;
        }
      );

      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

async function build() {
  console.log('Building ESM version...');

  try {
    // Build ESM version to dist/esm/
    execSync('tsc --module es2020 --moduleResolution node --outDir dist/esm', { stdio: 'inherit' });

    // Add .js extensions to all imports (required for browser ES modules)
    console.log('Adding .js extensions to imports...');
    const projectRoot = path.join(__dirname, '..');
    const esmDir = path.join(projectRoot, 'dist/esm');
    addJsExtensions(esmDir, projectRoot);

    // Create package.json in ESM directory to mark it as ESM
    const esmPackageJson = {
      type: 'module'
    };
    fs.writeFileSync(
      path.join(esmDir, 'package.json'),
      JSON.stringify(esmPackageJson, null, 2)
    );

    console.log('✓ ESM build complete: dist/esm/');
    console.log('✓ CommonJS build: dist/ (cjs)');
    console.log('');
    console.log('Package now supports both:');
    console.log('  - CommonJS: require("pdq-wasm")');
    console.log('  - ES Modules: import { PDQ } from "pdq-wasm"');
  } catch (error) {
    console.error('✗ ESM build failed:', error.message);
    process.exit(1);
  }
}

build();
