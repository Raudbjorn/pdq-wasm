#!/usr/bin/env node
/**
 * Generate test images for E2E tests
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

async function generateTestImages() {
  console.log('Generating E2E test images...');

  // Create fixtures directory if it doesn't exist
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Image 1: Red circle on white background
  const redCircle = Buffer.from(
    `<svg width="400" height="400">
      <rect width="400" height="400" fill="white"/>
      <circle cx="200" cy="200" r="150" fill="red"/>
    </svg>`
  );

  await sharp(redCircle)
    .png()
    .toFile(path.join(FIXTURES_DIR, 'red-circle.png'));

  console.log('✓ Generated red-circle.png');

  // Image 2: Blue square on white background (very different from circle)
  const blueSquare = Buffer.from(
    `<svg width="400" height="400">
      <rect width="400" height="400" fill="white"/>
      <rect x="100" y="100" width="200" height="200" fill="blue"/>
    </svg>`
  );

  await sharp(blueSquare)
    .png()
    .toFile(path.join(FIXTURES_DIR, 'blue-square.png'));

  console.log('✓ Generated blue-square.png');

  // Image 3: Red circle copy (same as Image 1, for duplicate test)
  await sharp(redCircle)
    .png()
    .toFile(path.join(FIXTURES_DIR, 'red-circle-copy.png'));

  console.log('✓ Generated red-circle-copy.png (duplicate)');

  // Image 4: Green triangle on white background (different)
  const greenTriangle = Buffer.from(
    `<svg width="400" height="400">
      <rect width="400" height="400" fill="white"/>
      <polygon points="200,50 350,350 50,350" fill="green"/>
    </svg>`
  );

  await sharp(greenTriangle)
    .png()
    .toFile(path.join(FIXTURES_DIR, 'green-triangle.png'));

  console.log('✓ Generated green-triangle.png');

  console.log('\n✅ All test images generated successfully!');
  console.log(`Location: ${FIXTURES_DIR}`);
}

generateTestImages().catch(console.error);
