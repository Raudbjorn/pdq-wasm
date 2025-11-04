#!/usr/bin/env node
/**
 * Build ESM (ES Module) version alongside CommonJS
 * This creates a proper dual-build setup for the package
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function addJsExtensions(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      addJsExtensions(filePath);
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
    const esmDir = path.join(__dirname, '../dist/esm');
    addJsExtensions(esmDir);

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
