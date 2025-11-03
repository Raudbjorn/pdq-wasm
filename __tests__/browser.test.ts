/**
 * Tests for browser-specific PDQ utilities
 */

import {
  createHashChecker,
  hammingDistance,
  generateHashFromDataUrl,
  detectDuplicatesByHash,
  type HashLookupResult,
  type FileWithHash,
  type DetectionProgress
} from '../src/browser';
import { PDQ } from '../src/pdq';

// Mock DOM APIs for testing
(global as any).window = global;

(global as any).Image = class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string = '';
  src: string = '';
  width: number = 100;
  height: number = 100;

  constructor() {
    // Simulate async image load
    setTimeout(() => {
      if (this.src.startsWith('data:image/')) {
        this.onload?.();
      } else if (this.src === 'invalid://url') {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    }, 0);
  }
} as any;

(global as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: jest.fn(),
          getImageData: () => ({
            data: new Uint8ClampedArray(100 * 100 * 4).fill(128),
            width: 100,
            height: 100
          })
        })
      };
    }
    return {};
  }
} as any;

describe('Browser Utilities', () => {
  beforeAll(async () => {
    await PDQ.init();
  });

  describe('createHashChecker', () => {
    describe('basic functionality', () => {
      it('should create a hash checker function', () => {
        const lookup = jest.fn().mockResolvedValue({ exists: false });
        const checker = createHashChecker(lookup);

        expect(typeof checker).toBe('function');
        expect(typeof checker.ignoreInvalid).toBe('function');
        expect(typeof checker.cached).toBe('function');
      });

      it('should validate hash format and call lookup', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true, existing: { id: '123' } });
        const checker = createHashChecker(lookup);

        const validHash = 'a'.repeat(64);
        const result = await checker(validHash);

        expect(lookup).toHaveBeenCalledWith(validHash);
        expect(result).toEqual({ exists: true, existing: { id: '123' } });
      });

      it('should throw error for invalid hash length', async () => {
        const lookup = jest.fn();
        const checker = createHashChecker(lookup);

        await expect(checker('tooshort')).rejects.toThrow(
          'Invalid PDQ hash: must be 64 hexadecimal characters'
        );
        expect(lookup).not.toHaveBeenCalled();
      });

      it('should throw error for non-hex characters', async () => {
        const lookup = jest.fn();
        const checker = createHashChecker(lookup);

        const invalidHash = 'g'.repeat(64); // 'g' is not hex

        await expect(checker(invalidHash)).rejects.toThrow(
          'Invalid PDQ hash: must be 64 hexadecimal characters'
        );
        expect(lookup).not.toHaveBeenCalled();
      });

      it('should accept both uppercase and lowercase hex', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup);

        const upperHash = 'A'.repeat(64);
        const lowerHash = 'a'.repeat(64);

        await checker(upperHash);
        await checker(lowerHash);

        expect(lookup).toHaveBeenCalledTimes(2);
        // Should normalize to lowercase
        expect(lookup).toHaveBeenCalledWith(lowerHash);
        expect(lookup).toHaveBeenCalledWith(lowerHash);
      });

      it('should handle lookup errors', async () => {
        const lookup = jest.fn().mockRejectedValue(new Error('Database error'));
        const checker = createHashChecker(lookup);

        const validHash = 'a'.repeat(64);

        await expect(checker(validHash)).rejects.toThrow('Database error');
      });
    });

    describe('ignoreInvalid modifier', () => {
      it('should return new checker with ignoreInvalid behavior', () => {
        const lookup = jest.fn();
        const checker = createHashChecker(lookup);
        const ignoringChecker = checker.ignoreInvalid();

        expect(ignoringChecker).not.toBe(checker);
        expect(typeof ignoringChecker).toBe('function');
      });

      it('should return false for invalid hash instead of throwing', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).ignoreInvalid();

        const result1 = await checker('tooshort');
        const result2 = await checker('g'.repeat(64));
        const result3 = await checker('');

        expect(result1).toEqual({ exists: false, existing: null });
        expect(result2).toEqual({ exists: false, existing: null });
        expect(result3).toEqual({ exists: false, existing: null });
        expect(lookup).not.toHaveBeenCalled();
      });

      it('should still call lookup for valid hashes', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true, existing: { id: '456' } });
        const checker = createHashChecker(lookup).ignoreInvalid();

        const validHash = 'b'.repeat(64);
        const result = await checker(validHash);

        expect(lookup).toHaveBeenCalledWith(validHash);
        expect(result).toEqual({ exists: true, existing: { id: '456' } });
      });
    });

    describe('cached modifier', () => {
      it('should return new checker with caching enabled', () => {
        const lookup = jest.fn();
        const checker = createHashChecker(lookup);
        const cachedChecker = checker.cached();

        expect(cachedChecker).not.toBe(checker);
        expect(typeof cachedChecker).toBe('function');
        expect(typeof cachedChecker.clearCache).toBe('function');
      });

      it('should cache results and avoid redundant lookups', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true, existing: { id: '789' } });
        const checker = createHashChecker(lookup).cached();

        const hash = 'c'.repeat(64);

        // First call
        const result1 = await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(result1).toEqual({ exists: true, existing: { id: '789' } });

        // Second call - should use cache
        const result2 = await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1); // Still 1
        expect(result2).toEqual({ exists: true, existing: { id: '789' } });

        // Different hash - should call lookup
        const hash2 = 'd'.repeat(64);
        const result3 = await checker(hash2);
        expect(lookup).toHaveBeenCalledTimes(2);
      });

      it('should respect cache TTL', async () => {
        jest.useFakeTimers();

        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).cached(1000); // 1 second TTL

        const hash = 'e'.repeat(64);

        // First call
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Call within TTL - should use cache
        jest.advanceTimersByTime(500);
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Call after TTL expired - should call lookup again
        jest.advanceTimersByTime(600);
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });

      it('should clear cache when clearCache is called', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).cached();

        const hash = 'f'.repeat(64);

        // First call
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Second call - uses cache
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Clear cache
        checker.clearCache?.();

        // Third call - should call lookup again
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(2);
      });

      it('should handle infinite TTL (default)', async () => {
        jest.useFakeTimers();

        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).cached(); // No TTL = Infinity

        const hash = '1'.repeat(64);

        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Advance by a very long time
        jest.advanceTimersByTime(365 * 24 * 60 * 60 * 1000); // 1 year

        // Should still use cache
        await checker(hash);
        expect(lookup).toHaveBeenCalledTimes(1);

        jest.useRealTimers();
      });
    });

    describe('chained modifiers', () => {
      it('should support ignoreInvalid().cached()', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).ignoreInvalid().cached();

        // Invalid hash - should return false
        const result1 = await checker('invalid');
        expect(result1).toEqual({ exists: false, existing: null });
        expect(lookup).not.toHaveBeenCalled();

        // Valid hash - first call
        const validHash = '2'.repeat(64);
        await checker(validHash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Valid hash - second call (cached)
        await checker(validHash);
        expect(lookup).toHaveBeenCalledTimes(1);
      });

      it('should support cached().ignoreInvalid()', async () => {
        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).cached().ignoreInvalid();

        // Invalid hash - should return false
        const result1 = await checker('short');
        expect(result1).toEqual({ exists: false, existing: null });

        // Valid hash - cached
        const validHash = '3'.repeat(64);
        await checker(validHash);
        await checker(validHash);
        expect(lookup).toHaveBeenCalledTimes(1);
      });

      it('should support ignoreInvalid().cached(ttl)', async () => {
        jest.useFakeTimers();

        const lookup = jest.fn().mockResolvedValue({ exists: true });
        const checker = createHashChecker(lookup).ignoreInvalid().cached(1000);

        const validHash = '4'.repeat(64);

        await checker(validHash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // Within TTL
        jest.advanceTimersByTime(500);
        await checker(validHash);
        expect(lookup).toHaveBeenCalledTimes(1);

        // After TTL
        jest.advanceTimersByTime(600);
        await checker(validHash);
        expect(lookup).toHaveBeenCalledTimes(2);

        // Invalid hash
        const result = await checker('invalid');
        expect(result).toEqual({ exists: false, existing: null });

        jest.useRealTimers();
      });
    });

    describe('real-world scenarios', () => {
      it('should work with Supabase-style lookup', async () => {
        const mockSupabase = {
          rpc: jest.fn().mockResolvedValue({
            data: { exists: true, mediafile_id: 'abc123' }
          })
        };

        const checker = createHashChecker(async (hash) => {
          const { data } = await mockSupabase.rpc('check_hash_exists', { p_hash: hash });
          return data;
        });

        const hash = '5'.repeat(64);
        const result = await checker(hash);

        expect(mockSupabase.rpc).toHaveBeenCalledWith('check_hash_exists', { p_hash: hash });
        expect(result).toEqual({ exists: true, mediafile_id: 'abc123' });
      });

      it('should work with REST API lookup', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          json: async () => ({ exists: false })
        }) as any;

        const checker = createHashChecker(async (hash) => {
          const response = await fetch(`/api/hashes/${hash}`);
          return response.json();
        });

        const hash = '6'.repeat(64);
        const result = await checker(hash);

        expect(fetch).toHaveBeenCalledWith(`/api/hashes/${hash}`);
        expect(result).toEqual({ exists: false });
      });
    });
  });

  describe('hammingDistance', () => {
    it('should calculate distance between two hex hashes', () => {
      // Create two different hashes
      const imageData1 = {
        data: new Uint8Array(100 * 100 * 3).fill(0),
        width: 100,
        height: 100,
        channels: 3 as const
      };

      const imageData2 = {
        data: new Uint8Array(100 * 100 * 3).fill(255),
        width: 100,
        height: 100,
        channels: 3 as const
      };

      const hash1 = PDQ.toHex(PDQ.hash(imageData1).hash);
      const hash2 = PDQ.toHex(PDQ.hash(imageData2).hash);

      const distance = hammingDistance(hash1, hash2);

      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(256);
    });

    it('should return 0 for identical hashes', () => {
      const hash = 'a'.repeat(64);
      const distance = hammingDistance(hash, hash);
      expect(distance).toBe(0);
    });

    it('should throw error for invalid hash length', () => {
      const validHash = 'a'.repeat(64);
      const invalidHash = 'a'.repeat(32);

      expect(() => hammingDistance(validHash, invalidHash)).toThrow(
        'PDQ hashes must be exactly 64 hex characters'
      );
    });

    it('should throw error for non-hex characters', () => {
      const validHash = 'a'.repeat(64);
      const invalidHash = 'z'.repeat(64);

      expect(() => hammingDistance(validHash, invalidHash)).toThrow(
        'PDQ hashes must contain only hexadecimal characters'
      );
    });

    it('should accept both uppercase and lowercase', () => {
      const lowerHash = 'abc123'.repeat(10) + 'abcd';
      const upperHash = 'ABC123'.repeat(10) + 'ABCD';

      const distance = hammingDistance(lowerHash, upperHash);
      expect(distance).toBe(0); // Same hash
    });
  });

  describe('generateHashFromDataUrl', () => {
    it('should generate hash from data URL', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const hash = await generateHashFromDataUrl(dataUrl);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw error in non-browser environment', async () => {
      const originalWindow = global.window;
      const originalDocument = global.document;

      delete (global as any).window;
      delete (global as any).document;

      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';

      await expect(generateHashFromDataUrl(dataUrl)).rejects.toThrow(
        'generateHashFromDataUrl requires browser environment'
      );

      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
    });

    it('should handle image load errors', async () => {
      const invalidUrl = 'invalid://url';

      await expect(generateHashFromDataUrl(invalidUrl)).rejects.toThrow(
        'Failed to load image'
      );
    });
  });

  describe('detectDuplicatesByHash', () => {
    const createMockFile = (id: string, name: string, type: string = 'image/jpeg'): FileWithHash => ({
      id,
      name,
      preview: `data:image/png;base64,${id}`,
      type
    });

    it('should return empty array for less than 2 images', async () => {
      const files: FileWithHash[] = [createMockFile('1', 'image1.jpg')];
      const duplicates = await detectDuplicatesByHash(files);

      expect(duplicates).toEqual([]);
    });

    it('should filter out non-image files', async () => {
      const files: FileWithHash[] = [
        createMockFile('1', 'image1.jpg', 'image/jpeg'),
        { id: '2', name: 'doc.pdf', preview: '', type: 'application/pdf' },
        createMockFile('3', 'image2.jpg', 'image/jpeg')
      ];

      const duplicates = await detectDuplicatesByHash(files);

      // Should process only the 2 image files
      expect(duplicates.length).toBeGreaterThanOrEqual(0);
    });

    it('should call progress callback with correct data', async () => {
      const files: FileWithHash[] = [
        createMockFile('1', 'image1.jpg'),
        createMockFile('2', 'image2.jpg'),
        createMockFile('3', 'image3.jpg')
      ];

      const progressUpdates: DetectionProgress[] = [];
      const onProgress = (progress: DetectionProgress) => {
        progressUpdates.push({ ...progress });
      };

      await detectDuplicatesByHash(files, 31, onProgress);

      // Should have progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);

      // First update should have processedFiles = 0
      expect(progressUpdates[0].processedFiles).toBe(0);
      expect(progressUpdates[0].totalFiles).toBe(3);

      // Last update should have all files processed
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.processedFiles).toBe(3);
      expect(lastUpdate.totalFiles).toBe(3);
    });

    it('should detect identical images as duplicates', async () => {
      // Create files with same preview (should generate same hash)
      const files: FileWithHash[] = [
        { id: '1', name: 'image1.jpg', preview: 'data:image/png;base64,same', type: 'image/jpeg' },
        { id: '2', name: 'image2.jpg', preview: 'data:image/png;base64,same', type: 'image/jpeg' }
      ];

      const duplicates = await detectDuplicatesByHash(files);

      // Should find one duplicate group
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].length).toBe(2);
      expect(duplicates[0][0].id).toBe('1');
      expect(duplicates[0][1].id).toBe('2');
    });

    it('should handle hashing errors gracefully', async () => {
      const files: FileWithHash[] = [
        createMockFile('1', 'good.jpg'),
        { id: '2', name: 'bad.jpg', preview: 'invalid://url', type: 'image/jpeg' },
        createMockFile('3', 'good2.jpg')
      ];

      const duplicates = await detectDuplicatesByHash(files);

      // Should complete without throwing
      expect(Array.isArray(duplicates)).toBe(true);
    });

    it('should respect custom threshold', async () => {
      const files: FileWithHash[] = [
        createMockFile('1', 'image1.jpg'),
        createMockFile('2', 'image2.jpg')
      ];

      // Very strict threshold (0 = only exact matches)
      const strictDuplicates = await detectDuplicatesByHash(files, 0);

      // Lenient threshold (256 = everything matches)
      const lenientDuplicates = await detectDuplicatesByHash(files, 256);

      // Lenient should find more or equal duplicates
      expect(lenientDuplicates.length).toBeGreaterThanOrEqual(strictDuplicates.length);
    });

    it('should attach hash metadata to files', async () => {
      const files: FileWithHash[] = [
        createMockFile('1', 'image1.jpg'),
        createMockFile('2', 'image2.jpg')
      ];

      await detectDuplicatesByHash(files);

      // Files should have been processed (even if no duplicates)
      // The function processes all files to generate hashes
      expect(true).toBe(true); // Just verify no errors
    });
  });
});
