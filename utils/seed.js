// utils/seed.js — seeds default plans + super admin on first run
import { Plan }       from "../models/Plan.js";
import { SuperAdmin } from "../models/SuperAdmin.js";

export const seedDefaults = async () => {

  // ── Super Admin ─────────────────────────────────────────────────────────────
  const adminCount = await SuperAdmin.countDocuments();
  if (adminCount === 0) {
    await SuperAdmin.create({
      name:     process.env.SUPER_ADMIN_NAME     || "DAB Super Admin",
      email:    process.env.SUPER_ADMIN_EMAIL    || "admin@dokabinabox.com",
      password: process.env.SUPER_ADMIN_PASSWORD || "DAB@SuperAdmin2024",
      role:     "superadmin",
    });
    console.log("✅ Default super admin created:", process.env.SUPER_ADMIN_EMAIL);
  }

  // ── Default Plans ───────────────────────────────────────────────────────────
  const planCount = await Plan.countDocuments();
  if (planCount === 0) {
    await Plan.insertMany([
      {
        name: "Manual", slug: "manual",
        description: "Basic free plan for small restaurants",
        sortOrder: 1,
        price: { monthly: 0, yearly: 0 },
        trialDays: 0,
        features: {
          maxTables: 5, maxMenuItems: 30, maxWaiters: 1, maxAdmins: 1,
          waiterApp: false, qrOrdering: true, analytics: false,
          invoicing: true, kotPrinting: false, multiWaiter: false,
          customBranding: false, apiAccess: false, prioritySupport: false,
        },
      },
      {
        name: "Pro", slug: "pro",
        description: "For growing restaurants with full waiter management",
        sortOrder: 2,
        price: { monthly: 999, yearly: 9999 },
        trialDays: 14,
        features: {
          maxTables: 20, maxMenuItems: -1, maxWaiters: 5, maxAdmins: 2,
          waiterApp: true, qrOrdering: true, analytics: true,
          invoicing: true, kotPrinting: true, multiWaiter: true,
          customBranding: false, apiAccess: false, prioritySupport: false,
        },
      },
      {
        name: "Pro Plus", slug: "pro_plus",
        description: "Full-featured plan for large or multi-branch restaurants",
        sortOrder: 3,
        price: { monthly: 2499, yearly: 24999 },
        trialDays: 14,
        features: {
          maxTables: -1, maxMenuItems: -1, maxWaiters: -1, maxAdmins: -1,
          waiterApp: true, qrOrdering: true, analytics: true,
          invoicing: true, kotPrinting: true, multiWaiter: true,
          customBranding: true, apiAccess: true, prioritySupport: true,
        },
      },
    ]);
    console.log("✅ Default plans seeded: Manual, Pro, Pro Plus");
  }
};
