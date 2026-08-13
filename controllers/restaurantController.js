// controllers/restaurantController.js
import { Restaurant } from "../models/Restaurant.js";
import { Plan }       from "../models/Plan.js";
import { AuditLog }   from "../models/AuditLog.js";
import {
  provisionRestaurant,
  buildSlug,
  buildDbName,
  generateApiKey,
} from "../utils/provision.js";
import { buildRestaurantURI, closeRestaurantDB } from "../config/db.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
const resolveFeatures = (plan, overrides = {}) => {
  const base = plan.features.toObject ? plan.features.toObject() : plan.features;
  return { ...base, ...Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined && v !== null)
  )};
};

// ── GET /api/restaurants ──────────────────────────────────────────────────────
export const getRestaurants = async (req, res) => {
  try {
    const { status, plan, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (plan)   filter.planName = { $regex: plan, $options: "i" };
    if (search) filter.$or = [
      { name:             { $regex: search, $options: "i" } },
      { slug:             { $regex: search, $options: "i" } },
      { "profile.ownerEmail": { $regex: search, $options: "i" } },
      { "profile.city":   { $regex: search, $options: "i" } },
    ];

    const [restaurants, total] = await Promise.all([
      Restaurant.find(filter)
        .populate("plan", "name slug price features")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .select("-mongoUri -adminPassword"),
      Restaurant.countDocuments(filter),
    ]);

    // Summary stats
    const stats = {
      total:     await Restaurant.countDocuments(),
      active:    await Restaurant.countDocuments({ status: "active" }),
      trial:     await Restaurant.countDocuments({ status: "trial" }),
      suspended: await Restaurant.countDocuments({ status: "suspended" }),
    };

    res.json({ restaurants, total, page: Number(page), pages: Math.ceil(total / limit), stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/restaurants/:slug ────────────────────────────────────────────────
export const getRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug })
      .populate("plan", "name slug price features")
      .select("-mongoUri -adminPassword");
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    res.json({ restaurant });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/restaurants ─────────────────────────────────────────────────────
// Creates a new restaurant + provisions its database
export const createRestaurant = async (req, res) => {
  try {
    const {
      name, planId,
      ownerName, ownerEmail, ownerPhone,
      city, state, address, gstNo,
      adminEmail, adminPassword,
      serverUrl, notes, tags,
      billingCycle = "monthly",
    } = req.body;

    if (!name)          return res.status(400).json({ message: "Restaurant name is required" });
    if (!planId)        return res.status(400).json({ message: "Plan is required" });
    if (!adminEmail)    return res.status(400).json({ message: "Admin email is required" });
    if (!adminPassword) return res.status(400).json({ message: "Admin password is required" });

    // Validate plan
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const slug   = buildSlug(name);
    const dbName = buildDbName(name);

    // Check uniqueness
    const existing = await Restaurant.findOne({ $or: [{ slug }, { dbName }] });
    if (existing) return res.status(400).json({ message: `Restaurant "${name}" already exists` });

    // ── Provision the database ────────────────────────────────────────────────
    let provisionResult;
    try {
      provisionResult = await provisionRestaurant({
        name, ownerName, ownerEmail, ownerPhone, city,
        adminEmail,
        adminPasswordPlain: adminPassword,
      });
    } catch (provErr) {
      return res.status(500).json({
        message: "Database provisioning failed",
        error: provErr.message,
      });
    }

    // ── Calculate trial/billing dates ─────────────────────────────────────────
    const trialDays  = plan.trialDays || 14;
    const trialEnds  = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const nextDue    = new Date(trialEnds);
    if (billingCycle === "yearly") nextDue.setFullYear(nextDue.getFullYear() + 1);
    else nextDue.setMonth(nextDue.getMonth() + 1);

    // ── Create restaurant document ────────────────────────────────────────────
    const restaurant = await Restaurant.create({
      name,
      slug,
      dbName:        provisionResult.dbName,
      mongoUri:      provisionResult.mongoUri,
      plan:          plan._id,
      planName:      plan.name,
      status:        "trial",
      apiKey:        provisionResult.apiKey,
      adminEmail,
      adminPassword, // will be hashed by pre-save hook
      adminName:     ownerName || "Admin",
      profile: { ownerName, ownerEmail, ownerPhone, city, state, address, gstNo },
      billing: {
        status:    "trial",
        trialEnds,
        nextDue,
        amount:    billingCycle === "yearly" ? plan.price.yearly : plan.price.monthly,
        cycle:     billingCycle,
      },
      features:  resolveFeatures(plan),
      serverUrl: serverUrl || "",
      notes:     notes || "",
      tags:      tags || [],
    });

    // Log
    await AuditLog.create({
      actor:   req.admin?.email || "system",
      actorId: req.admin?._id,
      action:  "RESTAURANT_CREATED",
      target:  slug,
      details: { name, plan: plan.name, dbName: provisionResult.dbName },
      ip:      req.ip,
    });

    res.status(201).json({
      message: "Restaurant created and database provisioned!",
      restaurant: {
        ...restaurant.toObject(),
        mongoUri:      undefined, // never expose
        adminPassword: undefined,
      },
      credentials: {
        adminEmail,
        adminPassword, // show once on creation
        apiKey: provisionResult.apiKey,
        dbName: provisionResult.dbName,
        mongoUri: provisionResult.mongoUri, // show once so admin can add to .env
      },
    });
  } catch (err) {
    console.error("createRestaurant error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/restaurants/:slug ────────────────────────────────────────────────
export const updateRestaurant = async (req, res) => {
  try {
    const {
      name, planId, status, serverUrl,
      ownerName, ownerEmail, ownerPhone, city, state, address, gstNo,
      notes, tags, featureOverrides, billingCycle,
    } = req.body;

    const restaurant = await Restaurant.findOne({ slug: req.params.slug }).populate("plan");
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    // Update plan if changed
    let plan = restaurant.plan;
    if (planId && planId !== String(restaurant.plan._id)) {
      plan = await Plan.findById(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      restaurant.plan     = plan._id;
      restaurant.planName = plan.name;
    }

    // Update fields
    if (name)       restaurant.name       = name;
    if (status)     restaurant.status     = status;
    if (serverUrl !== undefined) restaurant.serverUrl = serverUrl;
    if (notes !== undefined)     restaurant.notes     = notes;
    if (tags)       restaurant.tags       = tags;

    // Profile
    if (ownerName)  restaurant.profile.ownerName  = ownerName;
    if (ownerEmail) restaurant.profile.ownerEmail = ownerEmail;
    if (ownerPhone) restaurant.profile.ownerPhone = ownerPhone;
    if (city)       restaurant.profile.city       = city;
    if (state)      restaurant.profile.state      = state;
    if (address)    restaurant.profile.address    = address;
    if (gstNo)      restaurant.profile.gstNo      = gstNo;

    // Feature overrides
    if (featureOverrides) {
      restaurant.featureOverrides = { ...restaurant.featureOverrides, ...featureOverrides };
      restaurant.features = resolveFeatures(plan, restaurant.featureOverrides);
    } else {
      restaurant.features = resolveFeatures(plan, restaurant.featureOverrides);
    }

    // Billing cycle
    if (billingCycle) restaurant.billing.cycle = billingCycle;

    await restaurant.save();

    await AuditLog.create({
      actor: req.admin?.email, actorId: req.admin?._id,
      action: "RESTAURANT_UPDATED", target: req.params.slug, ip: req.ip,
    });

    res.json({ message: "Restaurant updated", restaurant });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/restaurants/:slug/status ──────────────────────────────────────
export const setRestaurantStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;
    const allowed = ["active", "suspended", "trial", "cancelled"];
    if (!allowed.includes(status))
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(", ")}` });

    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    restaurant.status        = status;
    restaurant.suspendReason = status === "suspended" ? (reason || "Suspended by DAB admin") : "";
    await restaurant.save();

    await AuditLog.create({
      actor: req.admin?.email, actorId: req.admin?._id,
      action: `RESTAURANT_${status.toUpperCase()}`,
      target: req.params.slug,
      details: { reason },
      ip: req.ip,
    });

    res.json({ message: `Restaurant ${status}`, restaurant });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/restaurants/:slug/plan ────────────────────────────────────────
export const upgradeRestaurantPlan = async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    const oldPlan          = restaurant.planName;
    restaurant.plan        = plan._id;
    restaurant.planName    = plan.name;
    restaurant.features    = resolveFeatures(plan, restaurant.featureOverrides);
    restaurant.billing.amount = plan.price[restaurant.billing.cycle || "monthly"];
    await restaurant.save();

    await AuditLog.create({
      actor: req.admin?.email, actorId: req.admin?._id,
      action: "RESTAURANT_PLAN_CHANGED",
      target: req.params.slug,
      details: { from: oldPlan, to: plan.name },
      ip: req.ip,
    });

    res.json({ message: `Plan upgraded to ${plan.name}`, restaurant });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/restaurants/:slug/regenerate-key ───────────────────────────────
export const regenerateApiKey = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    restaurant.apiKey = generateApiKey();
    await restaurant.save();

    res.json({ message: "API key regenerated", apiKey: restaurant.apiKey });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/restaurants/:slug ────────────────────────────────────────────
// Soft delete only — does NOT drop the DB (data safety)
export const deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    // Close the DB connection if cached
    await closeRestaurantDB(restaurant.dbName).catch(() => {});

    restaurant.status = "cancelled";
    await restaurant.save();

    await AuditLog.create({
      actor: req.admin?.email, actorId: req.admin?._id,
      action: "RESTAURANT_CANCELLED", target: req.params.slug, ip: req.ip,
    });

    res.json({ message: "Restaurant cancelled (data preserved in DB)" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/restaurants/:slug/stats ─────────────────────────────────────────
// Pull live stats from the restaurant's own DB
export const getRestaurantStats = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });

    const { getRestaurantDB } = await import("../config/db.js");
    let conn;
    try {
      conn = await getRestaurantDB(restaurant.mongoUri, restaurant.dbName);
    } catch {
      return res.json({ stats: restaurant.stats, live: false, message: "Could not connect to restaurant DB" });
    }

    // Use existing models if already registered on this connection
    const mongoose = await import("mongoose");
    const orderSchema = new mongoose.default.Schema({ total: Number, status: String, createdAt: Date, paymentStatus: String });
    const userSchema  = new mongoose.default.Schema({ role: String, isAdmin: Boolean });
    const menuSchema  = new mongoose.default.Schema({ isAvailable: Boolean });
    const tableSchema = new mongoose.default.Schema({ status: String });

    const Order    = conn.models.Order    || conn.model("Order",    orderSchema);
    const User     = conn.models.User     || conn.model("User",     userSchema);
    const MenuItem = conn.models.MenuItem || conn.model("MenuItem", menuSchema);
    const Table    = conn.models.Table    || conn.model("Table",    tableSchema);

    const [totalOrders, totalUsers, revenueAgg, todayOrders, totalMenuItems, totalTables] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments(),
      Order.aggregate([
        { $match: { status: "Completed", paymentStatus: "Paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Order.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      }),
      MenuItem.countDocuments({ isAvailable: true }).catch(() => 0),
      Table.countDocuments({ status: "Active" }).catch(() => 0),
    ]);

    const stats = {
      totalOrders,
      totalUsers,
      totalRevenue:    revenueAgg[0]?.total || 0,
      todayOrders,
      totalMenuItems,
      totalTables,
    };

    // Update cached stats
    restaurant.stats = { ...stats, lastSyncAt: new Date() };
    await restaurant.save({ validateBeforeSave: false });

    res.json({ stats, live: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/restaurants/:slug/credentials ────────────────────────────────────
// Returns mongoUri and apiKey (protected — super admin only)
export const getRestaurantCredentials = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug })
      .select("+mongoUri +apiKey");
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    res.json({
      dbName:   restaurant.dbName,
      mongoUri: restaurant.mongoUri,
      apiKey:   restaurant.apiKey,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
