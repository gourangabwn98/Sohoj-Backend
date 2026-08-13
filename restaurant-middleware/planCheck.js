// ─────────────────────────────────────────────────────────────────────────────
// restaurant-middleware/planCheck.js
//
// ADD THIS FILE to your existing restaurant servers (Kolhad, Adda Cafe, etc.)
// This middleware verifies the restaurant's plan with DAB on each request.
//
// Usage in restaurant server.js:
//   import { planCheck, requireFeature } from "./middleware/planCheck.js";
//   app.use(planCheck);                          // global check
//   router.get("/analytics", requireFeature("analytics"), handler);
// ─────────────────────────────────────────────────────────────────────────────

// Cache plan data for 5 minutes to avoid hammering DAB on every request
let planCache = null;
let planCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fetchPlanFromDAB = async () => {
  const DAB_URL = process.env.DAB_API_URL;
  const API_KEY = process.env.DAB_API_KEY;

  if (!DAB_URL || !API_KEY) {
    // DAB not configured — allow all (standalone mode)
    return { status: "active", features: { waiterApp: true, analytics: true, kotPrinting: true } };
  }

  const response = await fetch(`${DAB_URL}/api/verify`, {
    headers: { "x-dab-api-key": API_KEY },
  });

  if (!response.ok) throw new Error(`DAB verify failed: ${response.status}`);
  return response.json();
};

// ── Main plan check middleware ────────────────────────────────────────────────
export const planCheck = async (req, res, next) => {
  try {
    const now = Date.now();

    // Use cache if fresh
    if (!planCache || now - planCacheAt > CACHE_TTL) {
      planCache   = await fetchPlanFromDAB();
      planCacheAt = now;
    }

    // Attach plan info to every request
    req.dabPlan = planCache;

    // Block if suspended
    if (planCache.status === "suspended") {
      return res.status(403).json({
        message: "Restaurant access suspended. Contact your service provider.",
        suspended: true,
      });
    }

    next();
  } catch (err) {
    // If DAB is unreachable, don't block the restaurant
    console.warn("DAB plan check failed (allowing request):", err.message);
    req.dabPlan = { status: "active", features: {} };
    next();
  }
};

// ── Feature gate middleware ───────────────────────────────────────────────────
// Usage: router.get("/analytics", requireFeature("analytics"), handler)
export const requireFeature = (featureName) => (req, res, next) => {
  const features = req.dabPlan?.features || {};
  if (features[featureName] === false) {
    return res.status(403).json({
      message: `This feature (${featureName}) is not available on your current plan.`,
      feature: featureName,
      upgradeRequired: true,
    });
  }
  next();
};

// ── Table limit check ─────────────────────────────────────────────────────────
// Usage: router.post("/tables", checkTableLimit, createTableHandler)
export const checkTableLimit = async (req, res, next) => {
  try {
    const maxTables = req.dabPlan?.features?.maxTables;
    if (!maxTables || maxTables === -1) return next(); // unlimited

    const { Table } = await import("../models/Table.js"); // adjust path
    const count = await Table.countDocuments({ status: "Active" });
    if (count >= maxTables) {
      return res.status(403).json({
        message: `Table limit reached (${maxTables}). Upgrade your plan for more tables.`,
        limit: maxTables,
        current: count,
        upgradeRequired: true,
      });
    }
    next();
  } catch {
    next();
  }
};
