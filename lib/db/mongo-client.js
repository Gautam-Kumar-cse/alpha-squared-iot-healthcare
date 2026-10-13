/**
 * ALPHA SQUARED — MongoDB Atlas Primary Cloud Database Client
 * 
 * Manages resilient MongoDB connection pooling, automatic index management,
 * and high-performance querying for IoT telemetry, clinical vitals, and device states.
 * 
 * Serverless & Container Optimized:
 * - Reuses client instance via global connection caching across warm lambdas.
 * - Enforces timeout boundaries (5s) to avoid blocking cold boots.
 * - Graceful degradation: Safely reports UNCONFIGURED/ERROR if MONGODB_URI is absent or unreachable.
 * - Strict security: MONGODB_URI is only read from server-side environment variables.
 */

import { MongoClient } from 'mongodb';

export const MONGO_STATUS = {
  UNCONFIGURED: 'UNCONFIGURED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR'
};

const DEFAULT_DB_NAME = 'alpha_squared_iot';

class MongoDatabaseClient {
  constructor() {
    this.client = null;
    this.db = null;
    this.dbName = DEFAULT_DB_NAME;
    this.status = MONGO_STATUS.UNCONFIGURED;
    this.lastError = null;
    this.indexesCreated = false;
    this.connectionPromise = null;
  }

  /**
   * Determine whether MONGODB_URI is provided in environment
   */
  isConfigured() {
    return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0);
  }

  /**
   * Get current connection status and telemetry metrics
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      status: this.status,
      databaseName: this.isConfigured() ? this.dbName : null,
      lastError: this.lastError,
      isConnected: this.status === MONGO_STATUS.CONNECTED && Boolean(this.db)
    };
  }

  /**
   * Connect to MongoDB Atlas cluster
   */
  async connect() {
    if (!this.isConfigured()) {
      this.status = MONGO_STATUS.UNCONFIGURED;
      return null;
    }

    if (this.status === MONGO_STATUS.CONNECTED && this.db) {
      return this.db;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const uri = process.env.MONGODB_URI.trim();
    this.status = MONGO_STATUS.CONNECTING;
    this.lastError = null;

    this.connectionPromise = (async () => {
      try {
        // Cache client across serverless function re-entries via global symbol
        const globalKey = Symbol.for('alphasquared.mongo.client');
        let client = globalThis[globalKey];

        if (!client) {
          client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            maxPoolSize: 10,
            minPoolSize: 1,
            retryWrites: true
          });
          await client.connect();
          globalThis[globalKey] = client;
        }

        this.client = client;

        // Parse database name from URI if present, otherwise default to alpha_squared_iot
        const urlMatch = uri.match(/\/([^/?]+)(\?|$)/);
        if (urlMatch && urlMatch[1] && urlMatch[1] !== 'admin') {
          this.dbName = urlMatch[1];
        } else {
          this.dbName = process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME;
        }

        this.db = client.db(this.dbName);
        this.status = MONGO_STATUS.CONNECTED;

        // Ensure compound indexes on collections
        await this.ensureIndexes();

        return this.db;
      } catch (err) {
        this.status = MONGO_STATUS.ERROR;
        this.lastError = err.message;
        this.db = null;
        console.warn('[MONGODB_ATLAS_CONNECT_WARNING] Unable to connect to MongoDB Atlas cluster:', err.message);
        throw err;
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Ensure essential collection indexes for high-speed queries & sorting
   */
  async ensureIndexes() {
    if (this.indexesCreated || !this.db) return;

    try {
      const readingsCol = this.db.collection('health_readings');
      await Promise.all([
        readingsCol.createIndex({ deviceId: 1, timestamp: -1 }, { background: true }),
        readingsCol.createIndex({ patientId: 1, timestamp: -1 }, { background: true }),
        readingsCol.createIndex({ timestamp: -1 }, { background: true }),
        readingsCol.createIndex({ isTestFixture: 1 }, { background: true, sparse: true })
      ]);

      const deviceStatesCol = this.db.collection('device_states');
      await deviceStatesCol.createIndex({ deviceId: 1 }, { unique: true, background: true });

      this.indexesCreated = true;
    } catch (idxErr) {
      console.warn('[MONGODB_INDEX_WARNING] Could not verify collection indexes:', idxErr.message);
    }
  }

  /**
   * Insert a normalized telemetry reading into MongoDB Atlas
   */
  async insertReading(reading) {
    const db = await this.connect();
    if (!db) {
      throw new Error('MongoDB Atlas is not configured. Provide MONGODB_URI in environment.');
    }

    const doc = {
      ...reading,
      _createdAt: new Date()
    };

    const result = await db.collection('health_readings').insertOne(doc);
    if (!result.acknowledged) {
      throw new Error('MongoDB Atlas write failed: document insert was not acknowledged.');
    }

    return { ...doc, _id: result.insertedId };
  }

  /**
   * Retrieve the latest telemetry reading for a device or patient
   */
  async getLatestReading(deviceId = null, patientId = null) {
    const db = await this.connect();
    if (!db) return null;

    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (patientId) query.patientId = patientId;

    const doc = await db.collection('health_readings')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(1)
      .next();

    return doc;
  }

  /**
   * Retrieve historical readings with range and date filtering
   */
  async getHistoryReadings({
    deviceId = null,
    patientId = null,
    range = 'all',
    startDate = null,
    endDate = null,
    limit = 100,
    source = 'ALL',
    excludeTests = false
  } = {}) {
    const db = await this.connect();
    if (!db) return [];

    const query = {};

    if (deviceId) query.deviceId = deviceId;
    if (patientId) query.patientId = patientId;

    if (source && source.toUpperCase() !== 'ALL') {
      query.source = source.toUpperCase();
    }

    if (excludeTests) {
      query.isTestFixture = { $ne: true };
    }

    const now = Date.now();
    let timeFilter = null;

    if (range && range !== 'all') {
      let rangeMs = 24 * 60 * 60 * 1000;
      if (range === 'weekly') rangeMs = 7 * 24 * 60 * 60 * 1000;
      else if (range === 'monthly') rangeMs = 30 * 24 * 60 * 60 * 1000;
      timeFilter = { $gte: now - rangeMs };
    }

    if (startDate) {
      const startMs = typeof startDate === 'number' ? startDate : new Date(startDate).getTime();
      if (!isNaN(startMs)) {
        timeFilter = { ...(timeFilter || {}), $gte: startMs };
      }
    }

    if (endDate) {
      const endMs = typeof endDate === 'number' ? endDate : new Date(endDate).getTime();
      if (!isNaN(endMs)) {
        timeFilter = { ...(timeFilter || {}), $lte: endMs };
      }
    }

    if (timeFilter) {
      query.timestamp = timeFilter;
    }

    const safeLimit = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));

    const docs = await db.collection('health_readings')
      .find(query)
      .sort({ timestamp: 1 })
      .limit(safeLimit)
      .toArray();

    return docs;
  }

  /**
   * Update device state and presence
   */
  async upsertDeviceState(deviceId, state) {
    const db = await this.connect();
    if (!db) return null;

    const payload = {
      ...state,
      deviceId,
      updatedAt: Date.now()
    };

    await db.collection('device_states').updateOne(
      { deviceId },
      { $set: payload },
      { upsert: true }
    );

    return payload;
  }

  /**
   * Retrieve device state
   */
  async getDeviceState(deviceId) {
    const db = await this.connect();
    if (!db) return null;

    return await db.collection('device_states').findOne({ deviceId });
  }

  /**
   * Get count of stored readings
   */
  async getReadingsCount() {
    const db = await this.connect();
    if (!db) return 0;

    return await db.collection('health_readings').estimatedDocumentCount();
  }

  /**
   * Disconnect client (used in testing & cleanup)
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch {}
      this.client = null;
      this.db = null;
      this.status = MONGO_STATUS.DISCONNECTED;
      this.indexesCreated = false;
    }
  }
}

// Global singleton instance
const globalKey = Symbol.for('alphasquared.mongo.database');
const mongoClient = globalThis[globalKey] || new MongoDatabaseClient();
globalThis[globalKey] = mongoClient;

export default mongoClient;

