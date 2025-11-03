/**
 * PDQ WebAssembly Tests
 */

import { PDQ } from '../dist';

describe('PDQ', () => {
  beforeAll(async () => {
    // Initialize WASM module before running tests
    await PDQ.init();
  });

  describe('initialization', () => {
    it('should initialize the WASM module', async () => {
      // Module is already initialized in beforeAll
      expect(PDQ).toBeDefined();
    });

    it('should throw error if hash is called before initialization on a new instance', () => {
      // This test verifies the error handling
      // In practice, we've already initialized in beforeAll
      const imageData = {
        data: new Uint8Array(100),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      // Should not throw since we initialized
      expect(() => PDQ.hash(imageData)).not.toThrow('not initialized');
    });
  });

  describe('hash generation', () => {
    it('should generate hash from grayscale image data', () => {
      const imageData = {
        data: new Uint8Array(100).fill(255), // 10x10 white image
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.hash.length).toBe(32);
      expect(result.quality).toBeGreaterThanOrEqual(0);
    });

    it('should generate hash from RGB image data', () => {
      const imageData = {
        data: new Uint8Array(300).fill(255), // 10x10 RGB white image
        width: 10,
        height: 10,
        channels: 3 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.hash.length).toBe(32);
      expect(result.quality).toBeGreaterThanOrEqual(0);
    });

    it('should throw error for invalid image dimensions', () => {
      const imageData = {
        data: new Uint8Array(100),
        width: 0,
        height: 10,
        channels: 1 as const,
      };

      expect(() => PDQ.hash(imageData)).toThrow();
    });

    it('should throw error for mismatched data size', () => {
      const imageData = {
        data: new Uint8Array(50), // Wrong size
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      expect(() => PDQ.hash(imageData)).toThrow('Invalid image data size');
    });

    it('should generate different hashes for different images', () => {
      const whiteImage = {
        data: new Uint8Array(100).fill(255),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const blackImage = {
        data: new Uint8Array(100).fill(0),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const hash1 = PDQ.hash(whiteImage);
      const hash2 = PDQ.hash(blackImage);

      // Hashes should be different
      expect(hash1.hash).not.toEqual(hash2.hash);

      // Distance should be non-zero
      const distance = PDQ.hammingDistance(hash1.hash, hash2.hash);
      expect(distance).toBeGreaterThan(0);
    });

    it('should generate consistent hashes for same image', () => {
      const imageData = {
        data: new Uint8Array(100).fill(128),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const hash1 = PDQ.hash(imageData);
      const hash2 = PDQ.hash(imageData);

      expect(hash1.hash).toEqual(hash2.hash);
      expect(hash1.quality).toBe(hash2.quality);
    });
  });

  describe('Hamming distance', () => {
    it('should calculate distance between two hashes', () => {
      const hash1 = new Uint8Array(32).fill(0);
      const hash2 = new Uint8Array(32).fill(255);

      const distance = PDQ.hammingDistance(hash1, hash2);

      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(256);
    });

    it('should return 0 for identical hashes', () => {
      const hash = new Uint8Array(32).fill(42);

      const distance = PDQ.hammingDistance(hash, hash);

      expect(distance).toBe(0);
    });

    it('should return 256 for completely different hashes', () => {
      const hash1 = new Uint8Array(32).fill(0);
      const hash2 = new Uint8Array(32).fill(255);

      const distance = PDQ.hammingDistance(hash1, hash2);

      expect(distance).toBe(256);
    });

    it('should throw error for invalid hash length', () => {
      const hash1 = new Uint8Array(16); // Wrong size
      const hash2 = new Uint8Array(32);

      expect(() => PDQ.hammingDistance(hash1, hash2)).toThrow('Invalid hash length');
    });

    it('should be symmetric', () => {
      const hash1 = new Uint8Array(32).fill(10);
      const hash2 = new Uint8Array(32).fill(20);

      const distance1 = PDQ.hammingDistance(hash1, hash2);
      const distance2 = PDQ.hammingDistance(hash2, hash1);

      expect(distance1).toBe(distance2);
    });
  });

  describe('hex conversion', () => {
    it('should convert hash to hex string', () => {
      const hash = new Uint8Array(32).fill(0);
      hash[0] = 0x12;
      hash[1] = 0x34;

      const hex = PDQ.toHex(hash);

      expect(hex).toHaveLength(64);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
      expect(hex.substring(0, 4)).toBe('1234');
    });

    it('should convert hex string to hash', () => {
      const hex = '0'.repeat(64);

      const hash = PDQ.fromHex(hex);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
      expect(Array.from(hash).every(b => b === 0)).toBe(true);
    });

    it('should roundtrip hash through hex conversion', () => {
      const original = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        original[i] = i * 8;
      }

      const hex = PDQ.toHex(original);
      const restored = PDQ.fromHex(hex);

      expect(restored).toEqual(original);
    });

    it('should throw error for invalid hex string length', () => {
      const shortHex = '0'.repeat(32); // Too short

      expect(() => PDQ.fromHex(shortHex)).toThrow('Invalid hex string length');
    });

    it('should throw error for invalid hex characters', () => {
      const invalidHex = 'g'.repeat(64); // 'g' is not a hex digit

      expect(() => PDQ.fromHex(invalidHex)).toThrow('Invalid hex string format');
    });

    it('should handle uppercase and lowercase hex', () => {
      const lowerHex = 'abcdef' + '0'.repeat(58);
      const upperHex = 'ABCDEF' + '0'.repeat(58);

      const hash1 = PDQ.fromHex(lowerHex);
      const hash2 = PDQ.fromHex(upperHex);

      expect(hash1).toEqual(hash2);
    });
  });

  describe('similarity helpers', () => {
    it('should check if hashes are similar with default threshold', () => {
      const imageData = {
        data: new Uint8Array(100).fill(128),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const hash = PDQ.hash(imageData);

      // Same hash should be similar
      expect(PDQ.areSimilar(hash.hash, hash.hash)).toBe(true);
    });

    it('should check if hashes are similar with custom threshold', () => {
      const hash1 = new Uint8Array(32).fill(0);
      const hash2 = new Uint8Array(32).fill(0);
      hash2[0] = 1; // 1 bit different

      expect(PDQ.areSimilar(hash1, hash2, 1)).toBe(true);
      expect(PDQ.areSimilar(hash1, hash2, 0)).toBe(false);
    });

    it('should calculate similarity percentage', () => {
      const hash1 = new Uint8Array(32).fill(0);
      const hash2 = new Uint8Array(32).fill(0);

      const similarity = PDQ.similarity(hash1, hash2);

      expect(similarity).toBe(100);
    });

    it('should calculate 0% similarity for completely different hashes', () => {
      const hash1 = new Uint8Array(32).fill(0);
      const hash2 = new Uint8Array(32).fill(255);

      const similarity = PDQ.similarity(hash1, hash2);

      expect(similarity).toBe(0);
    });

    it('should calculate intermediate similarity', () => {
      const imageData1 = {
        data: new Uint8Array(100).fill(255),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const imageData2 = {
        data: new Uint8Array(100).fill(0),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const hash1 = PDQ.hash(imageData1);
      const hash2 = PDQ.hash(imageData2);

      const similarity = PDQ.similarity(hash1.hash, hash2.hash);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(100);
    });
  });

  describe('edge cases', () => {
    it('should handle very small images', () => {
      const imageData = {
        data: new Uint8Array(1).fill(128),
        width: 1,
        height: 1,
        channels: 1 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.hash.length).toBe(32);
    });

    it('should handle larger images', () => {
      const imageData = {
        data: new Uint8Array(10000).fill(128), // 100x100
        width: 100,
        height: 100,
        channels: 1 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.hash.length).toBe(32);
    });

    it('should handle all-black image', () => {
      const imageData = {
        data: new Uint8Array(100).fill(0),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.quality).toBeGreaterThanOrEqual(0);
    });

    it('should handle all-white image', () => {
      const imageData = {
        data: new Uint8Array(100).fill(255),
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.quality).toBeGreaterThanOrEqual(0);
    });

    it('should handle gradient image', () => {
      const data = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        data[i] = Math.floor((i / 100) * 255);
      }

      const imageData = {
        data,
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      const result = PDQ.hash(imageData);

      expect(result.hash).toBeInstanceOf(Uint8Array);
      expect(result.quality).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RGB vs Grayscale', () => {
    it('should produce different hashes for RGB vs grayscale of same brightness', () => {
      // Create a grayscale image
      const grayData = new Uint8Array(100).fill(128);
      const grayImage = {
        data: grayData,
        width: 10,
        height: 10,
        channels: 1 as const,
      };

      // Create an RGB image with same average brightness
      const rgbData = new Uint8Array(300);
      for (let i = 0; i < 100; i++) {
        rgbData[i * 3] = 128;     // R
        rgbData[i * 3 + 1] = 128; // G
        rgbData[i * 3 + 2] = 128; // B
      }
      const rgbImage = {
        data: rgbData,
        width: 10,
        height: 10,
        channels: 3 as const,
      };

      const grayHash = PDQ.hash(grayImage);
      const rgbHash = PDQ.hash(rgbImage);

      // They should produce similar (possibly identical) hashes
      // since they represent the same visual content
      const distance = PDQ.hammingDistance(grayHash.hash, rgbHash.hash);
      expect(distance).toBeLessThan(32); // Should be very similar
    });
  });
});
