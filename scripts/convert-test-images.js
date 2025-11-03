#!/usr/bin/env node
/**
 * Convert test images from WebP to JPEG and PNG formats
 * This expands test coverage to include more common image formats
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FIXTURES_DIR = path.join(__dirname, '../__fixtures__/images');
const webpFiles = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.webp'));

async function convertImages() {
  console.log(`Converting ${webpFiles.length} WebP images to JPEG and PNG...`);

  let jpegCount = 0;
  let pngCount = 0;

  for (const webpFile of webpFiles) {
    const baseName = webpFile.replace('.webp', '');
    const inputPath = path.join(FIXTURES_DIR, webpFile);
    const jpegPath = path.join(FIXTURES_DIR, `${baseName}.jpg`);
    const pngPath = path.join(FIXTURES_DIR, `${baseName}.png`);

    try {
      // Convert to JPEG
      await sharp(inputPath)
        .jpeg({ quality: 95 })
        .toFile(jpegPath);
      jpegCount++;

      // Convert to PNG
      await sharp(inputPath)
        .png({ compressionLevel: 9 })
        .toFile(pngPath);
      pngCount++;

      if ((jpegCount + pngCount) % 100 === 0) {
        console.log(`  Converted ${jpegCount} JPEG and ${pngCount} PNG images...`);
      }
    } catch (error) {
      console.error(`Error converting ${webpFile}:`, error.message);
    }
  }

  console.log(`\n✓ Conversion complete!`);
  console.log(`  - ${jpegCount} JPEG images created`);
  console.log(`  - ${pngCount} PNG images created`);

  // Calculate total size
  const allFiles = fs.readdirSync(FIXTURES_DIR);
  let totalSize = 0;
  for (const file of allFiles) {
    const stat = fs.statSync(path.join(FIXTURES_DIR, file));
    totalSize += stat.size;
  }

  console.log(`  - Total fixture size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Total files: ${allFiles.length}`);
}

convertImages().catch(console.error);
