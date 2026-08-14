// routes/index.js
import express from "express";
import { protect, restaurantApiKey } from "../middleware/auth.js";

// ── Auth ──────────────────────────────────────────────────────────────────────
import { login, getMe, changePassword } from "../controllers/authController.js";

// ── Plans ─────────────────────────────────────────────────────────────────────
import {
  getPlans, getPlan, createPlan, updatePlan, deletePlan,
} from "../controllers/planController.js";

// ── Restaurants ───────────────────────────────────────────────────────────────
import {
  getRestaurants,
  getRestaurant,
  createRestaurant,
  updateRestaurant,
  setRestaurantStatus,
  upgradeRestaurantPlan,
  regenerateApiKey,
  deleteRestaurant,
  getRestaurantStats,
  getRestaurantCredentials,
} from "../controllers/restaurantController.js";

// ── Verify (called by restaurant servers) ─────────────────────────────────────
import {
  verifyRestaurant,
  checkRestaurantBySlug,
  getGlobalStats,
} from "../controllers/verifyController.js";

// ── Audit logs ────────────────────────────────────────────────────────────────
import { AuditLog } from "../models/AuditLog.js";

const router = express.Router();

// ════════════════════════════════════════════════════════════════════════════════
// AUTH routes (no auth required)
// ════════════════════════════════════════════════════════════════════════════════
router.post("/auth/login",protect,           login);
router.get ("/auth/me",              protect, getMe);
router.post("/auth/change-password", protect, changePassword);

// ════════════════════════════════════════════════════════════════════════════════
// PLAN routes (super admin only)
// ════════════════════════════════════════════════════════════════════════════════
router.get   ("/plans",     protect, getPlans);
router.get   ("/plans/:id", protect, getPlan);
router.post  ("/plans",     protect, createPlan);
router.put   ("/plans/:id", protect, updatePlan);
router.delete("/plans/:id", protect, deletePlan);

// ════════════════════════════════════════════════════════════════════════════════
// RESTAURANT routes (super admin only)
// ════════════════════════════════════════════════════════════════════════════════
router.get   ("/restaurants",                        protect, getRestaurants);
router.post  ("/restaurants",                        protect, createRestaurant);
router.get   ("/restaurants/:slug",                  protect, getRestaurant);
router.put   ("/restaurants/:slug",                  protect, updateRestaurant);
router.delete("/restaurants/:slug",                  protect, deleteRestaurant);

// Status management
router.patch ("/restaurants/:slug/status",           protect, setRestaurantStatus);
// Plan upgrade/downgrade
router.patch ("/restaurants/:slug/plan",             protect, upgradeRestaurantPlan);
// Regenerate API key
router.patch ("/restaurants/:slug/regenerate-key",   protect, regenerateApiKey);
// Live stats from restaurant DB
router.get   ("/restaurants/:slug/stats",            protect, getRestaurantStats);
// Credentials (mongoUri, apiKey)
router.get   ("/restaurants/:slug/credentials",      protect, getRestaurantCredentials);

// ════════════════════════════════════════════════════════════════════════════════
// VERIFY routes (called by restaurant servers using their apiKey)
// ════════════════════════════════════════════════════════════════════════════════
// Restaurant server calls: GET /api/verify  with header: x-dab-api-key: <key>
router.get("/verify",              restaurantApiKey, verifyRestaurant);
router.get("/verify/check/:slug",  checkRestaurantBySlug);   // public (for internal use)
router.get("/verify/global-stats", protect, getGlobalStats);

// ════════════════════════════════════════════════════════════════════════════════
// AUDIT LOG routes
// ════════════════════════════════════════════════════════════════════════════════
router.get("/audit-logs", protect, async (req, res) => {
  try {
    const { page = 1, limit = 50, action, actor } = req.query;
    const filter = {};
    if (action) filter.action = { $regex: action, $options: "i" };
    if (actor)  filter.actor  = { $regex: actor,  $options: "i" };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ── Restaurant lookup by phone (called by restaurant server) ──────────────────
// No auth needed — internal server-to-server call secured by DAB_INTERNAL_KEY
router.get("/internal/find-by-phone/:phone", async (req, res) => {
  try {
    // Verify internal key so random people can't query this
    const key = req.headers["x-dab-internal-key"];
    if (key !== process.env.DAB_INTERNAL_KEY)
      return res.status(401).json({ message: "Unauthorized" });

    const { Restaurant } = await import("../models/Restaurant.js");

    // Find restaurant where this phone is the admin's phone
    const restaurant = await Restaurant.findOne({
      "profile.ownerPhone": req.params.phone,
      status: { $in: ["active", "trial"] },
    }).select("name slug dbName mongoUri planName features status");

    if (!restaurant)
      return res.status(404).json({ message: "No restaurant found for this phone" });

    res.json({
      name:     restaurant.name,
      slug:     restaurant.slug,
      dbName:   restaurant.dbName,
      mongoUri: restaurant.mongoUri,
      planName: restaurant.planName,
      features: restaurant.features,
      status:   restaurant.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ── Internal endpoints (called by restaurant server only) ─────────────────────
// Secured by x-dab-internal-key header

const verifyInternalKey = (req, res, next) => {
  if (req.headers["x-dab-internal-key"] !== process.env.DAB_INTERNAL_KEY)
    return res.status(401).json({ message: "Unauthorized" });
  next();
};

// Find restaurant by owner phone → used for admin/waiter login
router.get("/internal/find-by-phone/:phone", verifyInternalKey, async (req, res) => {
  try {
    const { Restaurant } = await import("../models/Restaurant.js");
    const r = await Restaurant.findOne({
      "profile.ownerPhone": req.params.phone,
      status: { $in: ["active", "trial"] },
    }).select("name slug dbName mongoUri planName features status");

    if (!r) return res.status(404).json({ message: "No restaurant for this phone" });
    res.json({
      name:     r.name,
      slug:     r.slug,
      dbName:   r.dbName,
      mongoUri: r.mongoUri,
      planName: r.planName,
      features: r.features,
      status:   r.status,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Find restaurant by slug → used for customer QR scan
router.get("/internal/find-by-slug/:slug", verifyInternalKey, async (req, res) => {
  try {
    const { Restaurant } = await import("../models/Restaurant.js");
    const r = await Restaurant.findOne({
      slug:   req.params.slug,
      status: { $in: ["active", "trial"] },
    }).select("name slug dbName mongoUri planName features status");

    if (!r) return res.status(404).json({ message: "Restaurant not found" });
    res.json({
      name:     r.name,
      slug:     r.slug,
      dbName:   r.dbName,
      mongoUri: r.mongoUri,
      planName: r.planName,
      features: r.features,
      status:   r.status,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Find restaurant by apiKey → used for restaurant server self-verification
router.get("/internal/find-by-apikey/:apiKey", verifyInternalKey, async (req, res) => {
  try {
    const { Restaurant } = await import("../models/Restaurant.js");
    const r = await Restaurant.findOne({
      apiKey: req.params.apiKey,
      status: { $in: ["active", "trial"] },
    }).select("name slug dbName mongoUri planName features status");

    if (!r) return res.status(404).json({ message: "Invalid API key" });
    res.json({
      name:     r.name,
      slug:     r.slug,
      dbName:   r.dbName,
      mongoUri: r.mongoUri,
      planName: r.planName,
      features: r.features,
      status:   r.status,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
