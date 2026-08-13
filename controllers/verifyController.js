// controllers/verifyController.js
// Called by restaurant servers to verify their plan and status
import { Restaurant } from "../models/Restaurant.js";
import { AuditLog }   from "../models/AuditLog.js";

// ── GET /api/verify — restaurant calls this with its API key ─────────────────
// Returns plan features so the restaurant can enforce limits
export const verifyRestaurant = async (req, res) => {
  // req.restaurant already attached by restaurantApiKey middleware
  const r = req.restaurant;
  res.json({
    restaurantId: r._id,
    name:         r.name,
    slug:         r.slug,
    status:       r.status,
    planName:     r.planName,
    features:     r.features,
    billing: {
      status:   r.billing.status,
      trialEnds:r.billing.trialEnds,
      nextDue:  r.billing.nextDue,
    },
  });
};

// ── GET /api/verify/check/:slug — super admin check by slug ─────────────────
export const checkRestaurantBySlug = async (req, res) => {
  try {
    const r = await Restaurant.findOne({ slug: req.params.slug })
      .select("name slug status planName features billing");
    if (!r) return res.status(404).json({ message: "Restaurant not found" });
    res.json({ restaurant: r });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/verify/stats — aggregate stats across all restaurants ────────────
export const getGlobalStats = async (req, res) => {
  try {
    const [total, active, trial, suspended, cancelled] = await Promise.all([
      Restaurant.countDocuments(),
      Restaurant.countDocuments({ status: "active" }),
      Restaurant.countDocuments({ status: "trial" }),
      Restaurant.countDocuments({ status: "suspended" }),
      Restaurant.countDocuments({ status: "cancelled" }),
    ]);

    // Revenue from all restaurants (cached stats)
    const revenueAgg = await Restaurant.aggregate([
      { $group: { _id: null, totalRevenue: { $sum: "$stats.totalRevenue" } } },
    ]);

    // Recent audit logs
    const recentLogs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      restaurants: { total, active, trial, suspended, cancelled },
      totalRevenue: revenueAgg[0]?.totalRevenue || 0,
      recentLogs,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
