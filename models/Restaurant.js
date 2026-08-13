// models/Restaurant.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const restaurantSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    name:        { type: String, required: true },
    slug:        { type: String, required: true, unique: true, lowercase: true },
    // e.g. "kolhad" → accessible as kolhad.yourdomain.com
    subdomain:   { type: String, unique: true, sparse: true },

    // ── Database ──────────────────────────────────────────────────────────────
    // Each restaurant gets its own MongoDB database
    dbName:      { type: String, required: true, unique: true },
    // Full connection URI (built from ATLAS_BASE_URI + dbName)
    mongoUri:    { type: String, required: true },

    // ── Plan & billing ────────────────────────────────────────────────────────
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planName:    { type: String },   // denormalized for quick access
    billing: {
      status:    { type: String, enum: ["trial", "active", "overdue", "cancelled"], default: "trial" },
      trialEnds: { type: Date },
      nextDue:   { type: Date },
      amount:    { type: Number, default: 0 },
      cycle:     { type: String, enum: ["monthly", "yearly"], default: "monthly" },
      lastPaid:  { type: Date },
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "suspended", "trial", "cancelled", "pending_setup"],
      default: "pending_setup",
    },
    suspendReason: { type: String },

    // ── Restaurant profile ────────────────────────────────────────────────────
    profile: {
      ownerName:   { type: String },
      ownerEmail:  { type: String },
      ownerPhone:  { type: String },
      address:     { type: String },
      city:        { type: String },
      state:       { type: String },
      logo:        { type: String },
      gstNo:       { type: String },
    },

    // ── Admin credentials (for the restaurant's admin panel) ──────────────────
    // DAB creates the first admin account when provisioning
    adminEmail:    { type: String },
    adminPassword: { type: String, select: false }, // hashed
    adminName:     { type: String, default: "Admin" },

    // ── Feature overrides (override plan defaults per restaurant) ─────────────
    featureOverrides: {
      maxTables:      { type: Number },
      maxMenuItems:   { type: Number },
      maxWaiters:     { type: Number },
      waiterApp:      { type: Boolean },
      analytics:      { type: Boolean },
      kotPrinting:    { type: Boolean },
      customBranding: { type: Boolean },
    },

    // ── Resolved features (plan + overrides — computed on save) ───────────────
    features: {
      maxTables:      { type: Number, default: 5 },
      maxMenuItems:   { type: Number, default: 50 },
      maxWaiters:     { type: Number, default: 1 },
      maxAdmins:      { type: Number, default: 1 },
      waiterApp:      { type: Boolean, default: false },
      qrOrdering:     { type: Boolean, default: true },
      analytics:      { type: Boolean, default: false },
      invoicing:      { type: Boolean, default: true },
      kotPrinting:    { type: Boolean, default: false },
      multiWaiter:    { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      apiAccess:      { type: Boolean, default: false },
      prioritySupport:{ type: Boolean, default: false },
    },

    // ── Server/deploy info ────────────────────────────────────────────────────
    serverUrl:  { type: String },  // e.g. https://kolhad-server.onrender.com
    apiKey:     { type: String },  // secret key for restaurant ↔ DAB communication

    // ── Notes ─────────────────────────────────────────────────────────────────
    notes:      { type: String },
    tags:       [{ type: String }],

    // ── Stats cache (updated periodically) ───────────────────────────────────
    stats: {
      totalOrders:   { type: Number, default: 0 },
      totalRevenue:  { type: Number, default: 0 },
      totalUsers:    { type: Number, default: 0 },
      lastOrderAt:   { type: Date },
      lastSyncAt:    { type: Date },
    },
  },
  { timestamps: true }
);

// ── Hash admin password before save ──────────────────────────────────────────
restaurantSchema.pre("save", async function (next) {
  if (this.isModified("adminPassword") && this.adminPassword) {
    this.adminPassword = await bcrypt.hash(this.adminPassword, 12);
  }
  next();
});

// ── Virtual: is trial expired ────────────────────────────────────────────────
restaurantSchema.virtual("isTrialExpired").get(function () {
  if (this.billing?.status !== "trial") return false;
  return this.billing?.trialEnds && new Date() > this.billing.trialEnds;
});

// ── Method: check feature access ─────────────────────────────────────────────
restaurantSchema.methods.hasFeature = function (featureName) {
  return !!this.features?.[featureName];
};

// ── Index for fast lookups ────────────────────────────────────────────────────
restaurantSchema.index({ slug: 1 });
restaurantSchema.index({ status: 1 });
restaurantSchema.index({ "billing.status": 1 });

export const Restaurant = mongoose.model("Restaurant", restaurantSchema);
