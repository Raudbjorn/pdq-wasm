# PostgreSQL Integration Guide

This guide covers storing PDQ hashes in PostgreSQL and performing similarity queries using standard SQL operators.

## Understanding PDQ Hash Storage

PDQ hashes are 256-bit values (32 bytes). The **similarity** between two hashes is determined by their **Hamming distance** (number of differing bits), not by numeric comparison of the hash values themselves.

**Important:** You cannot directly use `<` and `>` on hash values to determine similarity. Instead, you store hashes and calculate distances, which *can* be compared using `<` and `>`.

## Database Schema

### Basic Schema

```sql
CREATE TABLE images (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  pdq_hash VARCHAR(64) NOT NULL,  -- Hex representation (64 chars)
  pdq_hash_binary BYTEA,            -- Optional: Binary representation (32 bytes)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Index for exact hash lookups
  CONSTRAINT unique_hash UNIQUE(pdq_hash)
);

-- Index for fast hash lookups
CREATE INDEX idx_pdq_hash ON images(pdq_hash);
```

### Schema with Pre-computed Distances

For efficient similarity queries against a reference image:

```sql
CREATE TABLE image_similarities (
  id SERIAL PRIMARY KEY,
  image_id INTEGER REFERENCES images(id),
  reference_image_id INTEGER REFERENCES images(id),
  hamming_distance INTEGER NOT NULL,  -- 0-256
  similarity_percentage NUMERIC(5,2), -- 0.00-100.00

  -- Enable fast distance-based queries
  CONSTRAINT unique_pair UNIQUE(image_id, reference_image_id)
);

-- Index for sorting by distance
CREATE INDEX idx_hamming_distance ON image_similarities(reference_image_id, hamming_distance);
```

## Storing Hashes

### Using Hex Format (Recommended)

```javascript
const { PDQ } = require('pdq-wasm');
const { Client } = require('pg');

await PDQ.init();
const client = new Client({ /* connection config */ });
await client.connect();

// Hash an image
const imageData = {
  data: pixelData,
  width: 1920,
  height: 1080,
  channels: 3
};

const result = PDQ.hash(imageData);
const hexHash = PDQ.toHex(result.hash);

// Insert into PostgreSQL
await client.query(
  'INSERT INTO images (filename, pdq_hash) VALUES ($1, $2)',
  ['photo.jpg', hexHash]
);
```

### Using Binary Format (More Efficient)

```javascript
// Store as binary (32 bytes instead of 64 chars)
const binaryHash = Buffer.from(result.hash);

await client.query(
  'INSERT INTO images (filename, pdq_hash, pdq_hash_binary) VALUES ($1, $2, $3)',
  ['photo.jpg', hexHash, binaryHash]
);
```

## Querying and Comparing Distances

### Finding Similar Images (Single Reference)

```javascript
// 1. Get reference image hash
const referenceResult = await client.query(
  'SELECT pdq_hash FROM images WHERE id = $1',
  [referenceImageId]
);
const referenceHash = PDQ.fromHex(referenceResult.rows[0].pdq_hash);

// 2. Get all candidate hashes
const candidatesResult = await client.query(
  'SELECT id, filename, pdq_hash FROM images WHERE id != $1',
  [referenceImageId]
);

// 3. Calculate distances and find similar images
const threshold = 31; // PDQ recommended threshold
const similarImages = [];

for (const row of candidatesResult.rows) {
  const candidateHash = PDQ.fromHex(row.pdq_hash);
  const distance = PDQ.hammingDistance(referenceHash, candidateHash);

  if (distance <= threshold) {
    similarImages.push({
      id: row.id,
      filename: row.filename,
      distance: distance,
      similarity: ((256 - distance) / 256 * 100).toFixed(2)
    });
  }
}

// Sort by distance (most similar first)
similarImages.sort((a, b) => a.distance - b.distance);

console.log('Similar images:', similarImages);
```

### Using Pre-computed Distances for Fast Queries

This approach is much faster for repeated queries:

```javascript
// 1. Pre-compute and store distances (one-time or batch process)
async function precomputeDistances(referenceImageId) {
  const refResult = await client.query(
    'SELECT pdq_hash FROM images WHERE id = $1',
    [referenceImageId]
  );
  const referenceHash = PDQ.fromHex(refResult.rows[0].pdq_hash);

  const candidatesResult = await client.query(
    'SELECT id, pdq_hash FROM images WHERE id != $1',
    [referenceImageId]
  );

  for (const row of candidatesResult.rows) {
    const candidateHash = PDQ.fromHex(row.pdq_hash);
    const distance = PDQ.hammingDistance(referenceHash, candidateHash);
    const similarity = (256 - distance) / 256 * 100;

    await client.query(
      `INSERT INTO image_similarities
       (image_id, reference_image_id, hamming_distance, similarity_percentage)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (image_id, reference_image_id)
       DO UPDATE SET hamming_distance = $3, similarity_percentage = $4`,
      [row.id, referenceImageId, distance, similarity]
    );
  }
}

// 2. Query using SQL operators (< and > work on distances!)
async function findSimilarImages(referenceImageId, maxDistance = 31) {
  const result = await client.query(
    `SELECT
       i.id,
       i.filename,
       s.hamming_distance,
       s.similarity_percentage
     FROM image_similarities s
     JOIN images i ON i.id = s.image_id
     WHERE s.reference_image_id = $1
       AND s.hamming_distance <= $2
     ORDER BY s.hamming_distance ASC
     LIMIT 10`,
    [referenceImageId, maxDistance]
  );

  return result.rows;
}

// Example: Find images MORE similar than distance 20
const verySimilar = await client.query(
  `SELECT * FROM image_similarities
   WHERE reference_image_id = $1 AND hamming_distance < 20
   ORDER BY hamming_distance`,
  [referenceImageId]
);

// Example: Find images LESS similar (more different) than distance 50
const lessSimilar = await client.query(
  `SELECT * FROM image_similarities
   WHERE reference_image_id = $1 AND hamming_distance > 50
   ORDER BY hamming_distance DESC`,
  [referenceImageId]
);
```

## Comparing Distances Using < and >

Once distances are stored, you can use standard SQL comparison operators:

```sql
-- Find images that are MORE similar to A than to B
SELECT
  i.id,
  i.filename,
  sa.hamming_distance as distance_to_a,
  sb.hamming_distance as distance_to_b
FROM images i
JOIN image_similarities sa ON sa.image_id = i.id AND sa.reference_image_id = 1  -- A
JOIN image_similarities sb ON sb.image_id = i.id AND sb.reference_image_id = 2  -- B
WHERE sa.hamming_distance < sb.hamming_distance  -- More similar to A
ORDER BY sa.hamming_distance;

-- Find images where difference(A, B) > difference(C, D)
WITH distances AS (
  SELECT
    1 as pair_id,
    hamming_distance as dist_ab
  FROM image_similarities
  WHERE image_id = 2 AND reference_image_id = 1

  UNION ALL

  SELECT
    2 as pair_id,
    hamming_distance as dist_cd
  FROM image_similarities
  WHERE image_id = 4 AND reference_image_id = 3
)
SELECT
  (SELECT dist_ab FROM distances WHERE pair_id = 1) as difference_a_b,
  (SELECT dist_cd FROM distances WHERE pair_id = 2) as difference_c_d,
  (SELECT dist_ab FROM distances WHERE pair_id = 1) >
  (SELECT dist_cd FROM distances WHERE pair_id = 2) as a_b_more_different;
```

## Advanced: PostgreSQL Function for Hamming Distance

If you need to calculate Hamming distance directly in PostgreSQL (not recommended for performance):

```sql
-- Function to calculate Hamming distance between two hex hashes
CREATE OR REPLACE FUNCTION pdq_hamming_distance(hash1 VARCHAR(64), hash2 VARCHAR(64))
RETURNS INTEGER AS $$
DECLARE
  distance INTEGER := 0;
  byte1 INTEGER;
  byte2 INTEGER;
  xor_result INTEGER;
  i INTEGER;
BEGIN
  -- Convert hex to bytes and calculate Hamming distance
  FOR i IN 0..31 LOOP
    byte1 := ('x' || substring(hash1, i*2+1, 2))::bit(8)::integer;
    byte2 := ('x' || substring(hash2, i*2+1, 2))::bit(8)::integer;
    xor_result := byte1 # byte2;  -- XOR

    -- Count set bits
    WHILE xor_result > 0 LOOP
      distance := distance + (xor_result & 1);
      xor_result := xor_result >> 1;
    END LOOP;
  END LOOP;

  RETURN distance;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Use in queries
SELECT
  id,
  filename,
  pdq_hamming_distance(pdq_hash, 'a1b2c3d4...') as distance
FROM images
WHERE pdq_hamming_distance(pdq_hash, 'a1b2c3d4...') < 31
ORDER BY distance;
```

**Note:** Computing Hamming distance in PostgreSQL is much slower than pre-computing distances. Use pre-computed distances for production systems.

## Batch Operations

### Insert Multiple Images

```javascript
async function batchInsertImages(images) {
  await PDQ.init();

  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const img of images) {
    const result = PDQ.hash(img.data);
    const hexHash = PDQ.toHex(result.hash);

    values.push(`($${paramIndex}, $${paramIndex + 1})`);
    params.push(img.filename, hexHash);
    paramIndex += 2;
  }

  const query = `
    INSERT INTO images (filename, pdq_hash)
    VALUES ${values.join(', ')}
    RETURNING id, filename
  `;

  const result = await client.query(query, params);
  return result.rows;
}
```

### Batch Calculate Distances

```javascript
async function batchCalculateDistances(referenceId) {
  const refResult = await client.query(
    'SELECT pdq_hash FROM images WHERE id = $1',
    [referenceId]
  );
  const referenceHash = PDQ.fromHex(refResult.rows[0].pdq_hash);

  const candidatesResult = await client.query(
    'SELECT id, pdq_hash FROM images WHERE id != $1',
    [referenceId]
  );

  const hashes = candidatesResult.rows.map(row =>
    PDQ.fromHex(row.pdq_hash)
  );

  // Use orderBySimilarity for efficient batch processing
  const ordered = PDQ.orderBySimilarity(referenceHash, hashes, true);

  // Batch insert distances
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const match of ordered) {
    const imageId = candidatesResult.rows[match.index].id;
    values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
    params.push(imageId, referenceId, match.distance, match.similarity);
    paramIndex += 4;
  }

  if (values.length > 0) {
    const query = `
      INSERT INTO image_similarities
      (image_id, reference_image_id, hamming_distance, similarity_percentage)
      VALUES ${values.join(', ')}
      ON CONFLICT (image_id, reference_image_id) DO NOTHING
    `;

    await client.query(query, params);
  }
}
```

## Performance Optimization

### 1. Use Binary Format for Storage

Binary storage (BYTEA) uses 32 bytes vs 64 bytes for hex strings:

```sql
ALTER TABLE images ADD COLUMN pdq_hash_binary BYTEA;
CREATE INDEX idx_pdq_hash_binary ON images USING hash(pdq_hash_binary);
```

### 2. Partition Large Tables

For very large image collections:

```sql
CREATE TABLE image_similarities (
  -- ... columns ...
) PARTITION BY RANGE (hamming_distance);

CREATE TABLE image_similarities_very_similar
  PARTITION OF image_similarities FOR VALUES FROM (0) TO (32);

CREATE TABLE image_similarities_similar
  PARTITION OF image_similarities FOR VALUES FROM (32) TO (64);

CREATE TABLE image_similarities_different
  PARTITION OF image_similarities FOR VALUES FROM (64) TO (257);
```

### 3. Use Materialized Views

For frequently queried similarity rankings:

```sql
CREATE MATERIALIZED VIEW top_similar_images AS
SELECT
  reference_image_id,
  image_id,
  hamming_distance,
  similarity_percentage,
  ROW_NUMBER() OVER (PARTITION BY reference_image_id ORDER BY hamming_distance) as rank
FROM image_similarities
WHERE hamming_distance <= 31
ORDER BY reference_image_id, hamming_distance;

CREATE INDEX idx_top_similar ON top_similar_images(reference_image_id, rank);

-- Refresh periodically
REFRESH MATERIALIZED VIEW top_similar_images;
```

## Complete Example Application

```javascript
const { PDQ } = require('pdq-wasm');
const { Client } = require('pg');
const sharp = require('sharp');

class PDQImageDatabase {
  constructor(pgConfig) {
    this.client = new Client(pgConfig);
  }

  async init() {
    await PDQ.init();
    await this.client.connect();
    await this.createTables();
  }

  async createTables() {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        pdq_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_hash UNIQUE(pdq_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_pdq_hash ON images(pdq_hash);

      CREATE TABLE IF NOT EXISTS image_similarities (
        id SERIAL PRIMARY KEY,
        image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
        reference_image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
        hamming_distance INTEGER NOT NULL,
        similarity_percentage NUMERIC(5,2),
        CONSTRAINT unique_pair UNIQUE(image_id, reference_image_id)
      );

      CREATE INDEX IF NOT EXISTS idx_hamming_distance
        ON image_similarities(reference_image_id, hamming_distance);
    `);
  }

  async addImage(filename, imagePath) {
    // Load and hash image
    const img = sharp(imagePath);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

    const result = PDQ.hash({
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
      channels: info.channels
    });

    const hexHash = PDQ.toHex(result.hash);

    // Insert into database
    const insertResult = await this.client.query(
      'INSERT INTO images (filename, pdq_hash) VALUES ($1, $2) RETURNING id',
      [filename, hexHash]
    );

    return insertResult.rows[0].id;
  }

  async findSimilar(imageId, maxDistance = 31, limit = 10) {
    // Get reference hash
    const refResult = await this.client.query(
      'SELECT pdq_hash FROM images WHERE id = $1',
      [imageId]
    );

    if (refResult.rows.length === 0) {
      throw new Error('Image not found');
    }

    const referenceHash = PDQ.fromHex(refResult.rows[0].pdq_hash);

    // Get all other hashes
    const candidatesResult = await this.client.query(
      'SELECT id, filename, pdq_hash FROM images WHERE id != $1',
      [imageId]
    );

    const hashes = candidatesResult.rows.map(row => PDQ.fromHex(row.pdq_hash));

    // Order by similarity
    const ordered = PDQ.orderBySimilarity(referenceHash, hashes, true);

    // Filter and format results
    return ordered
      .filter(match => match.distance <= maxDistance)
      .slice(0, limit)
      .map(match => ({
        id: candidatesResult.rows[match.index].id,
        filename: candidatesResult.rows[match.index].filename,
        distance: match.distance,
        similarity: match.similarity.toFixed(2) + '%'
      }));
  }

  async compareDistances(imageId1, imageId2, imageId3, imageId4) {
    // Get all hashes
    const result = await this.client.query(
      'SELECT id, pdq_hash FROM images WHERE id = ANY($1)',
      [[imageId1, imageId2, imageId3, imageId4]]
    );

    const hashMap = {};
    result.rows.forEach(row => {
      hashMap[row.id] = PDQ.fromHex(row.pdq_hash);
    });

    // Calculate distances
    const distance_1_2 = PDQ.hammingDistance(hashMap[imageId1], hashMap[imageId2]);
    const distance_3_4 = PDQ.hammingDistance(hashMap[imageId3], hashMap[imageId4]);

    return {
      distance_1_2,
      distance_3_4,
      comparison: distance_1_2 > distance_3_4 ? 'more different' : 'less different',
      difference: Math.abs(distance_1_2 - distance_3_4)
    };
  }

  async close() {
    await this.client.end();
  }
}

// Usage
async function main() {
  const db = new PDQImageDatabase({
    host: 'localhost',
    database: 'images',
    user: 'postgres',
    password: 'password'
  });

  await db.init();

  // Add images
  const id1 = await db.addImage('photo1.jpg', '/path/to/photo1.jpg');
  const id2 = await db.addImage('photo2.jpg', '/path/to/photo2.jpg');

  // Find similar images
  const similar = await db.findSimilar(id1, 31, 10);
  console.log('Similar images:', similar);

  // Compare distances
  const comparison = await db.compareDistances(1, 2, 3, 4);
  console.log('Distance comparison:', comparison);

  await db.close();
}
```

## Summary

**Key Points:**

1. **Store hashes** using hex (VARCHAR(64)) or binary (BYTEA)
2. **Store distances** in a separate table for fast queries
3. **Use < and > operators** on distances, not hashes
4. **Pre-compute distances** for frequently queried image pairs
5. **Use `orderBySimilarity()`** for efficient batch processing

**SQL Operators on Distances:**
- `distance < 31` - Very similar
- `distance > 100` - Very different
- `dist_a_b < dist_c_d` - A and B are more similar than C and D
- `dist_a_b > dist_c_d` - A and B are less similar (more different) than C and D
