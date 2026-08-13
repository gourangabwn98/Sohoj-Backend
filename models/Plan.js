// models/Plan.js
import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    name:        { type: String, required: true, unique: true },
    // "manual" | "pro" | "pro_plus"
    slug:        { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    isActive:    { type: Boolean, default: true },

    // ── Pricing ───────────────────────────────────────────────────────────────
    price: {
      monthly:  { type: Number, default: 0 },  // ₹/month
      yearly:   { type: Number, default: 0 },  // ₹/year (discounted)
      currency: { type: String, default: "INR" },
    },

    // ── Feature limits ────────────────────────────────────────────────────────
    features: {
      maxTables:      { type: Number, default: 5 },     // -1 = unlimited
      maxMenuItems:   { type: Number, default: 50 },    // -1 = unlimited
      maxWaiters:     { type: Number, default: 1 },     // -1 = unlimited
      maxAdmins:      { type: Number, default: 1 },

      // Feature flags
      waiterApp:      { type: Boolean, default: false },
      qrOrdering:     { type: Boolean, default: true  },
      analytics:      { type: Boolean, default: false },
      invoicing:      { type: Boolean, default: true  },
      kotPrinting:    { type: Boolean, default: false },
      multiWaiter:    { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      apiAccess:      { type: Boolean, default: false },
      prioritySupport:{ type: Boolean, default: false },
    },

    // ── Trial ─────────────────────────────────────────────────────────────────
    trialDays: { type: Number, default: 14 },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Plan = mongoose.model("Plan", planSchema);
