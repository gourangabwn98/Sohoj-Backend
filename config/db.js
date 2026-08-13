// config/db.js — DAB Master DB + per-restaurant connection pool
import mongoose from "mongoose";

// ── Master connection ─────────────────────────────────────────────────────────
export const connectMasterDB = async () => {
  try {
    await mongoose.connect(process.env.DAB_MONGO_URI);
    console.log("✅ DAB Master DB connected:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ Master DB connection failed:", err.message);
    process.exit(1);
  }
};

// ── Per-restaurant connection cache ───────────────────────────────────────────
const connectionCache = new Map();

export const getRestaurantDB = async (mongoUri, dbName) => {
  const cacheKey = dbName;

  if (connectionCache.has(cacheKey)) {
    const cached = connectionCache.get(cacheKey);
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    if (cached.readyState === 1) return cached;
    // Remove stale connection
    connectionCache.delete(cacheKey);
  }

  try {
    const conn = await mongoose.createConnection(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    }).asPromise();

    connectionCache.set(cacheKey, conn);
    console.log(`✅ Restaurant DB connected: ${dbName}`);
    return conn;
  } catch (err) {
    console.error(`❌ Restaurant DB (${dbName}) connection failed:`, err.message);
    throw new Error(`Cannot connect to restaurant database: ${dbName}. Check ATLAS_BASE_URI.`);
  }
};

// ── Build full MongoDB URI from base URI + dbName ─────────────────────────────
export const buildRestaurantURI = (dbName) => {
  const base = process.env.ATLAS_BASE_URI;
  if (!base) {
    throw new Error(
      "ATLAS_BASE_URI is not set in .env. " +
      "Format: mongodb+srv://<user>:<pass>@cluster.mongodb.net"
    );
  }
  // Strip trailing slash if any
  const clean = base.replace(/\/$/, "");
  return `${clean}/${dbName}`;
};

// ── Close a specific restaurant connection ────────────────────────────────────
export const closeRestaurantDB = async (dbName) => {
  if (connectionCache.has(dbName)) {
    await connectionCache.get(dbName).close();
    connectionCache.delete(dbName);
    console.log(`🔌 Restaurant DB disconnected: ${dbName}`);
  }
};

// ── List all cached connections ───────────────────────────────────────────────
export const listConnections = () => {
  const result = [];
  connectionCache.forEach((conn, key) => {
    result.push({ dbName: key, state: conn.readyState });
  });
  return result;
};
