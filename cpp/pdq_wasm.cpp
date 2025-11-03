// ================================================================
// Copyright (c) Meta Platforms, Inc. and affiliates.
// WebAssembly bindings Copyright (c) 2025
// ================================================================

#include <emscripten/emscripten.h>
#include <pdq/cpp/hashing/pdqhashing.h>
#include <pdq/cpp/common/pdqhashtypes.h>
#include <pdq/cpp/common/pdqhamming.h>
#include <cstring>

using namespace facebook::pdq::hashing;

extern "C" {

/**
 * Hash an image from RGB pixel data
 *
 * @param rgbBuffer Pointer to RGB pixel data (R, G, B, R, G, B, ...)
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param hashOut Pointer to output buffer for 32-byte hash (256 bits as 32 uint8_t)
 * @param qualityOut Pointer to output int for quality score
 * @return 0 on success, non-zero on error
 */
EMSCRIPTEN_KEEPALIVE
int pdq_hash_from_rgb(
    const uint8_t* rgbBuffer,
    int width,
    int height,
    uint8_t* hashOut,
    int* qualityOut
) {
    if (!rgbBuffer || !hashOut || !qualityOut) {
        return -1;
    }

    if (width <= 0 || height <= 0) {
        return -2;
    }

    try {
        // Allocate buffers for PDQ computation
        float* luma = new float[width * height];
        float* buffer1 = new float[width * height];
        float* buffer2 = new float[width * height];
        float buffer64x64[64][64];
        float buffer16x64[16][64];
        float buffer16x16[16][16];

        // Separate RGB channels
        uint8_t* rChannel = new uint8_t[width * height];
        uint8_t* gChannel = new uint8_t[width * height];
        uint8_t* bChannel = new uint8_t[width * height];

        for (int i = 0; i < width * height; i++) {
            rChannel[i] = rgbBuffer[i * 3 + 0];
            gChannel[i] = rgbBuffer[i * 3 + 1];
            bChannel[i] = rgbBuffer[i * 3 + 2];
        }

        // Convert RGB to luma
        fillFloatLumaFromRGB(
            rChannel, gChannel, bChannel,
            height, width,
            width, 1,  // row stride, col stride
            luma
        );

        // Copy luma to buffer1
        memcpy(buffer1, luma, width * height * sizeof(float));

        // Compute PDQ hash
        Hash256 hash;
        int quality;

        pdqHash256FromFloatLuma(
            buffer1, buffer2,
            height, width,
            buffer64x64,
            buffer16x64,
            buffer16x16,
            hash,
            quality
        );

        // Convert Hash256 to byte array
        // Hash256 has 16 words of 16 bits each = 32 bytes
        for (int i = 0; i < 16; i++) {
            hashOut[i * 2] = (hash.w[i] >> 8) & 0xFF;
            hashOut[i * 2 + 1] = hash.w[i] & 0xFF;
        }

        *qualityOut = quality;

        // Cleanup
        delete[] luma;
        delete[] buffer1;
        delete[] buffer2;
        delete[] rChannel;
        delete[] gChannel;
        delete[] bChannel;

        return 0;
    } catch (...) {
        return -3;
    }
}

/**
 * Hash an image from grayscale pixel data
 *
 * @param grayBuffer Pointer to grayscale pixel data
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param hashOut Pointer to output buffer for 32-byte hash
 * @param qualityOut Pointer to output int for quality score
 * @return 0 on success, non-zero on error
 */
EMSCRIPTEN_KEEPALIVE
int pdq_hash_from_gray(
    const uint8_t* grayBuffer,
    int width,
    int height,
    uint8_t* hashOut,
    int* qualityOut
) {
    if (!grayBuffer || !hashOut || !qualityOut) {
        return -1;
    }

    if (width <= 0 || height <= 0) {
        return -2;
    }

    try {
        // Allocate buffers for PDQ computation
        float* luma = new float[width * height];
        float* buffer1 = new float[width * height];
        float* buffer2 = new float[width * height];
        float buffer64x64[64][64];
        float buffer16x64[16][64];
        float buffer16x16[16][16];

        // Convert grayscale to luma
        fillFloatLumaFromGrey(
            const_cast<uint8_t*>(grayBuffer),
            height, width,
            width, 1,  // row stride, col stride
            luma
        );

        // Copy luma to buffer1
        memcpy(buffer1, luma, width * height * sizeof(float));

        // Compute PDQ hash
        Hash256 hash;
        int quality;

        pdqHash256FromFloatLuma(
            buffer1, buffer2,
            height, width,
            buffer64x64,
            buffer16x64,
            buffer16x16,
            hash,
            quality
        );

        // Convert Hash256 to byte array
        for (int i = 0; i < 16; i++) {
            hashOut[i * 2] = (hash.w[i] >> 8) & 0xFF;
            hashOut[i * 2 + 1] = hash.w[i] & 0xFF;
        }

        *qualityOut = quality;

        // Cleanup
        delete[] luma;
        delete[] buffer1;
        delete[] buffer2;

        return 0;
    } catch (...) {
        return -3;
    }
}

/**
 * Compute Hamming distance between two PDQ hashes
 *
 * @param hash1 First hash (32 bytes)
 * @param hash2 Second hash (32 bytes)
 * @return Hamming distance (0-256), or -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int pdq_hamming_distance(const uint8_t* hash1, const uint8_t* hash2) {
    if (!hash1 || !hash2) {
        return -1;
    }

    try {
        Hash256 h1, h2;

        // Convert byte arrays to Hash256
        for (int i = 0; i < 16; i++) {
            h1.w[i] = (static_cast<uint16_t>(hash1[i * 2]) << 8) | hash1[i * 2 + 1];
            h2.w[i] = (static_cast<uint16_t>(hash2[i * 2]) << 8) | hash2[i * 2 + 1];
        }

        return h1.hammingDistance(h2);
    } catch (...) {
        return -1;
    }
}

/**
 * Convert hash bytes to hex string
 *
 * @param hashBytes Hash as 32 bytes
 * @param hexOut Output buffer for hex string (must be at least 65 bytes)
 */
EMSCRIPTEN_KEEPALIVE
void pdq_hash_to_hex(const uint8_t* hashBytes, char* hexOut) {
    if (!hashBytes || !hexOut) {
        return;
    }

    const char* hexChars = "0123456789abcdef";
    for (int i = 0; i < 32; i++) {
        hexOut[i * 2] = hexChars[(hashBytes[i] >> 4) & 0xF];
        hexOut[i * 2 + 1] = hexChars[hashBytes[i] & 0xF];
    }
    hexOut[64] = '\0';
}

/**
 * Convert hex string to hash bytes
 *
 * @param hexStr Hex string (64 characters)
 * @param hashOut Output buffer for hash bytes (32 bytes)
 * @return 0 on success, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int pdq_hex_to_hash(const char* hexStr, uint8_t* hashOut) {
    if (!hexStr || !hashOut) {
        return -1;
    }

    for (int i = 0; i < 32; i++) {
        char high = hexStr[i * 2];
        char low = hexStr[i * 2 + 1];

        // Convert hex chars to values
        int highVal = (high >= '0' && high <= '9') ? (high - '0') :
                     (high >= 'a' && high <= 'f') ? (high - 'a' + 10) :
                     (high >= 'A' && high <= 'F') ? (high - 'A' + 10) : -1;

        int lowVal = (low >= '0' && low <= '9') ? (low - '0') :
                    (low >= 'a' && low <= 'f') ? (low - 'a' + 10) :
                    (low >= 'A' && low <= 'F') ? (low - 'A' + 10) : -1;

        if (highVal < 0 || lowVal < 0) {
            return -1;
        }

        hashOut[i] = (highVal << 4) | lowVal;
    }

    return 0;
}

} // extern "C"
