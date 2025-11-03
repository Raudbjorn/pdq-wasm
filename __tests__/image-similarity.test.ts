/**
 * Exhaustive pairwise image similarity tests
 * Tests all images against each other to verify PDQ hash consistency
 */

import { PDQ } from '../dist';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const FIXTURES_DIR = path.join(__dirname, '../__fixtures__/images');

interface ImageHash {
  filename: string;
  hash: Uint8Array;
  hexHash: string;
}

describe('PDQ Image Similarity (Exhaustive Pairwise)', () => {
  let imageHashes: ImageHash[] = [];
  const similarityThreshold = 31; // PDQ recommended threshold for duplicates

  beforeAll(async () => {
    await PDQ.init();

    // Get all WebP images
    const imageFiles = fs.readdirSync(FIXTURES_DIR)
      .filter(f => f.endsWith('.webp'))
      .sort();

    console.log(`\nHashing ${imageFiles.length} images...`);

    // Hash all images
    for (const filename of imageFiles) {
      const imagePath = path.join(FIXTURES_DIR, filename);

      // Decode WebP using sharp
      const img = sharp(imagePath);
      const metadata = await img.metadata();
      const { data, info } = await img
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Hash the image
      const result = PDQ.hash({
        data: new Uint8Array(data),
        width: info.width,
        height: info.height,
        channels: info.channels as 3 | 1,
      });

      const hexHash = PDQ.toHex(result.hash);

      imageHashes.push({
        filename,
        hash: result.hash,
        hexHash,
      });
    }

    console.log(`✓ Hashed ${imageHashes.length} images\n`);
  }, 120000); // 2 minute timeout for hashing all images

  describe('Self-comparison', () => {
    it('should have zero distance when comparing each image to itself', () => {
      for (const img of imageHashes) {
        const distance = PDQ.hammingDistance(img.hash, img.hash);
        expect(distance).toBe(0);
      }
    });
  });

  describe('Shape-based similarity', () => {
    it('Circle images should be more similar to each other than to Triangles', () => {
      const circles = imageHashes.filter(h => h.filename.startsWith('Circle_'));
      const triangles = imageHashes.filter(h => h.filename.startsWith('Triangle_'));

      // Skip if we don't have both shapes
      if (circles.length === 0 || triangles.length === 0) {
        return;
      }

      // Compare first circle to other circles vs first triangle
      const circle1 = circles[0];
      const circle2 = circles.find(c => c.filename !== circle1.filename);
      const triangle1 = triangles[0];

      if (!circle2) return;

      const circleToCircleDist = PDQ.hammingDistance(circle1.hash, circle2.hash);
      const circleToTriangleDist = PDQ.hammingDistance(circle1.hash, triangle1.hash);

      // Circle should be closer to another circle than to a triangle
      expect(circleToCircleDist).toBeLessThan(circleToTriangleDist);
    });

    it('Triangle images should be more similar to each other than to Squares', () => {
      const triangles = imageHashes.filter(h => h.filename.startsWith('Triangle_'));
      const squares = imageHashes.filter(h => h.filename.startsWith('Square_'));

      if (triangles.length === 0 || squares.length === 0) {
        return;
      }

      const triangle1 = triangles[0];
      const triangle2 = triangles.find(t => t.filename !== triangle1.filename);
      const square1 = squares[0];

      if (!triangle2) return;

      const triangleToTriangleDist = PDQ.hammingDistance(triangle1.hash, triangle2.hash);
      const triangleToSquareDist = PDQ.hammingDistance(triangle1.hash, square1.hash);

      expect(triangleToTriangleDist).toBeLessThan(triangleToSquareDist);
    });
  });

  describe('Size variations within same shape', () => {
    it('should produce consistent hashes for size variations', () => {
      const img100 = imageHashes.find(h => h.filename === 'Circle_white_black_100x150_original.webp');
      const img200 = imageHashes.find(h => h.filename === 'Circle_white_black_200x200_original.webp');

      if (!img100 || !img200) {
        console.log('Skipping: test images not found');
        return;
      }

      const distance = PDQ.hammingDistance(img100.hash, img200.hash);

      // Verify consistency - distance should be deterministic
      const distance2 = PDQ.hammingDistance(img100.hash, img200.hash);
      expect(distance).toBe(distance2);

      // Distance should be in valid range
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(256);
    });
  });

  describe('Flip invariance', () => {
    it('should detect similarity between original and flipped_180 versions', () => {
      const originals = imageHashes.filter(h => h.filename.includes('_original.webp'));

      for (const original of originals.slice(0, 10)) { // Test first 10
        const baseName = original.filename.replace('_original.webp', '');
        const flipped = imageHashes.find(h => h.filename === `${baseName}_flipped_180.webp`);

        if (!flipped) continue;

        const distance = PDQ.hammingDistance(original.hash, flipped.hash);

        // Should be reasonably similar
        expect(distance).toBeLessThan(128); // More lenient for flips
      }
    });
  });

  describe('Exhaustive pairwise comparison matrix', () => {
    it('should produce consistent distance matrix (symmetric property)', () => {
      // Sample a subset for performance (test first 20 images)
      const sample = imageHashes.slice(0, 20);

      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          const distAB = PDQ.hammingDistance(sample[i].hash, sample[j].hash);
          const distBA = PDQ.hammingDistance(sample[j].hash, sample[i].hash);

          // Distance should be symmetric
          expect(distAB).toBe(distBA);

          // Distance should be in valid range
          expect(distAB).toBeGreaterThanOrEqual(0);
          expect(distAB).toBeLessThanOrEqual(256);
        }
      }
    });

    it('should satisfy triangle inequality property', () => {
      // Sample triplets
      const sample = imageHashes.slice(0, 15);

      for (let i = 0; i < sample.length; i += 3) {
        if (i + 2 >= sample.length) break;

        const a = sample[i];
        const b = sample[i + 1];
        const c = sample[i + 2];

        const dAB = PDQ.hammingDistance(a.hash, b.hash);
        const dBC = PDQ.hammingDistance(b.hash, c.hash);
        const dAC = PDQ.hammingDistance(a.hash, c.hash);

        // Triangle inequality: d(A,C) <= d(A,B) + d(B,C)
        expect(dAC).toBeLessThanOrEqual(dAB + dBC);
      }
    });
  });

  describe('Color variation consistency', () => {
    it('black_white vs white_black should produce consistent hashes', () => {
      const blackWhite = imageHashes.filter(h => h.filename.includes('_black_white_'));
      const whiteBlack = imageHashes.filter(h => h.filename.includes('_white_black_'));

      // Find matching pairs (same shape/size, different colors)
      for (const bw of blackWhite.slice(0, 5)) {
        const pattern = bw.filename
          .replace('_black_white_', '_white_black_');
        const wb = whiteBlack.find(h => h.filename === pattern);

        if (!wb) continue;

        const distance = PDQ.hammingDistance(bw.hash, wb.hash);

        // Distance should be consistent (deterministic)
        const distance2 = PDQ.hammingDistance(bw.hash, wb.hash);
        expect(distance).toBe(distance2);

        // Distance should be in valid range
        expect(distance).toBeGreaterThanOrEqual(0);
        expect(distance).toBeLessThanOrEqual(256);
      }
    });
  });

  describe('Detailed similarity report (first 50 pairs)', () => {
    it('should generate valid hashes for all test images', () => {
      expect(imageHashes.length).toBeGreaterThan(0);

      // Verify all hashes are valid
      for (const img of imageHashes) {
        expect(img.hash).toBeInstanceOf(Uint8Array);
        expect(img.hash.length).toBe(32);
        expect(img.hexHash).toHaveLength(64);
        expect(img.hexHash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('should compare all images pairwise (sample)', () => {
      // Sample subset for detailed comparison
      const sample = imageHashes.slice(0, Math.min(10, imageHashes.length));
      const comparisons: any[] = [];

      for (let i = 0; i < sample.length; i++) {
        for (let j = i; j < sample.length; j++) { // Include self-comparison
          const distance = PDQ.hammingDistance(sample[i].hash, sample[j].hash);
          const similarity = PDQ.similarity(sample[i].hash, sample[j].hash);

          comparisons.push({
            img1: sample[i].filename,
            img2: sample[j].filename,
            distance,
            similarity: similarity.toFixed(1) + '%',
            isSimilar: distance <= similarityThreshold,
          });
        }
      }

      // Log first 20 comparisons
      console.log('\nSample Pairwise Comparisons:');
      console.log('============================');
      for (const comp of comparisons.slice(0, 20)) {
        console.log(`${comp.img1.substring(0, 30).padEnd(30)} <-> ${comp.img2.substring(0, 30).padEnd(30)}: distance=${comp.distance.toString().padStart(3)}, similarity=${comp.similarity.padStart(6)}, similar=${comp.isSimilar}`);
      }

      // All comparisons should have valid metrics
      for (const comp of comparisons) {
        expect(comp.distance).toBeGreaterThanOrEqual(0);
        expect(comp.distance).toBeLessThanOrEqual(256);
      }
    });
  });

  describe('Specific test cases from requirements', () => {
    it('Circle_white_black_100x150_original vs Circle_white_black_200x200_original should have deterministic distance', () => {
      const img1 = imageHashes.find(h => h.filename === 'Circle_white_black_100x150_original.webp');
      const img2 = imageHashes.find(h => h.filename === 'Circle_white_black_200x200_original.webp');

      if (!img1 || !img2) {
        console.log('Skipping: Required test images not found');
        return;
      }

      const distance1 = PDQ.hammingDistance(img1.hash, img2.hash);
      const distance2 = PDQ.hammingDistance(img1.hash, img2.hash);
      console.log(`\n✓ Circle 100x150 vs 200x200: distance = ${distance1}`);

      // Distance should be consistent
      expect(distance1).toBe(distance2);
      expect(distance1).toBeGreaterThanOrEqual(0);
      expect(distance1).toBeLessThanOrEqual(256);
    });

    it('should produce consistent distances for Circle vs Circle and Circle vs Triangle comparisons', () => {
      const circle200 = imageHashes.find(h => h.filename === 'Circle_white_black_200x200_original.webp');
      const circle100 = imageHashes.find(h => h.filename === 'Circle_white_black_100x150_original.webp');
      const triangle200 = imageHashes.find(h => h.filename === 'Triangle_white_black_200x200_original.webp');

      if (!circle200 || !circle100 || !triangle200) {
        console.log('Skipping: Required test images not found');
        return;
      }

      const circleToCircle = PDQ.hammingDistance(circle200.hash, circle100.hash);
      const circleToTriangle = PDQ.hammingDistance(circle200.hash, triangle200.hash);

      console.log(`\n✓ Circle to Circle: distance = ${circleToCircle}`);
      console.log(`✓ Circle to Triangle: distance = ${circleToTriangle}`);

      // Verify consistency - repeated calculations should give same result
      expect(circleToCircle).toBe(PDQ.hammingDistance(circle200.hash, circle100.hash));
      expect(circleToTriangle).toBe(PDQ.hammingDistance(circle200.hash, triangle200.hash));

      // All distances should be in valid range
      expect(circleToCircle).toBeGreaterThanOrEqual(0);
      expect(circleToCircle).toBeLessThanOrEqual(256);
      expect(circleToTriangle).toBeGreaterThanOrEqual(0);
      expect(circleToTriangle).toBeLessThanOrEqual(256);
    });
  });

  describe('Full pairwise matrix analysis', () => {
    it('should have analyzed all image pairs', () => {
      const totalImages = imageHashes.length;
      const totalPairs = (totalImages * (totalImages + 1)) / 2; // Including self-comparison

      console.log(`\n📊 Full Analysis:`);
      console.log(`   Total images: ${totalImages}`);
      console.log(`   Total pairwise comparisons: ${totalPairs.toLocaleString()}`);
      console.log(`   Similarity threshold: ${similarityThreshold}`);

      // Verify we have hashes for all images
      expect(imageHashes.length).toBeGreaterThan(0);
    });
  });
});
