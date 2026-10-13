/**
 * ALPHA SQUARED — Safe Local JSON to MongoDB Atlas Migration Service
 * 
 * Prepares and executes safe, idempotent data migration from data/readings.json
 * to MongoDB Atlas.
 * 
 * Safety Guarantees:
 * 1. NEVER deletes or modifies local data/readings.json.
 * 2. Idempotent: Skips duplicates based on compound key (deviceId + timestamp).
 * 3. Dry-run mode by default: Reports migration plan without writing to database.
 * 4. Only performs real migration when explicitly requested and approved.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoClient from './mongo-client.js';

export class MigrationService {
  constructor() {
    this.storageFile = path.resolve(process.cwd(), 'data/readings.json');
  }

  /**
   * Inspect existing local JSON file and summarize available records
   */
  inspectLocalData() {
    if (!fs.existsSync(this.storageFile)) {
      return {
        exists: false,
        totalReadings: 0,
        devicesCount: 0,
        readings: [],
        message: 'No data/readings.json file found.'
      };
    }

    try {
      const raw = fs.readFileSync(this.storageFile, 'utf-8');
      const data = JSON.parse(raw);
      const readings = Array.isArray(data.readings) ? data.readings : [];
      const devices = data.devices && typeof data.devices === 'object' ? Object.keys(data.devices) : [];

      // Categorize readings
      const demoCount = readings.filter(r => r.source === 'DEMO' || r.isDemo).length;
      const realCount = readings.filter(r => r.source === 'REAL' && !r.isDemo).length;
      const testCount = readings.filter(r => r.isTestFixture).length;

      return {
        exists: true,
        filePath: this.storageFile,
        totalReadings: readings.length,
        devicesCount: devices.length,
        devices,
        composition: {
          realHardware: realCount,
          demoSimulated: demoCount,
          testFixtures: testCount
        },
        readings
      };
    } catch (err) {
      return {
        exists: true,
        error: err.message,
        totalReadings: 0,
        readings: []
      };
    }
  }

  /**
   * Run migration plan or execute migration with deduplication
   * 
   * @param {Object} options
   * @param {boolean} options.dryRun - When true, only inspects and returns what would be inserted
   * @param {boolean} options.excludeTestFixtures - When true, skips records tagged as test fixtures
   */
  async planOrMigrate({ dryRun = true, excludeTestFixtures = false } = {}) {
    const local = this.inspectLocalData();
    if (!local.exists || local.readings.length === 0) {
      return {
        success: false,
        dryRun,
        message: 'No local readings available to migrate.',
        recordsToMigrate: 0,
        recordsInserted: 0
      };
    }

    // Filter if requested
    let candidates = local.readings;
    if (excludeTestFixtures) {
      candidates = candidates.filter(r => !r.isTestFixture);
    }

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        message: 'Dry run completed. No data was written to MongoDB. Local data remains untouched.',
        sourceFile: local.filePath,
        totalLocalReadings: local.totalReadings,
        candidatesCount: candidates.length,
        composition: local.composition,
        mongoConfigured: mongoClient.isConfigured()
      };
    }

    // Real migration execution (requires MONGODB_URI and live connection)
    if (!mongoClient.isConfigured()) {
      throw new Error('Cannot execute migration: MONGODB_URI is not set in environment.');
    }

    const db = await mongoClient.connect();
    const readingsCol = db.collection('health_readings');

    let insertedCount = 0;
    let skippedDuplicates = 0;

    for (const record of candidates) {
      const deviceId = record.deviceId || 'ESP32-ALPHA-01';
      const timestamp = record.timestamp || record.receivedAt;

      // Check for existing record to prevent duplicates
      const existing = await readingsCol.findOne({ deviceId, timestamp });
      if (existing) {
        skippedDuplicates++;
        continue;
      }

      await readingsCol.insertOne({
        ...record,
        deviceId,
        timestamp,
        _migratedAt: new Date(),
        _migrationSource: 'LOCAL_JSON_DATA'
      });
      insertedCount++;
    }

    return {
      success: true,
      dryRun: false,
      message: `Migration completed successfully. Inserted ${insertedCount} records, skipped ${skippedDuplicates} existing duplicates. Local JSON file was preserved.`,
      sourceFile: local.filePath,
      insertedCount,
      skippedDuplicates,
      totalExamined: candidates.length
    };
  }
}

export const migrationService = new MigrationService();
export default migrationService;

