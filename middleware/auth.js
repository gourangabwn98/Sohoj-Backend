// middleware/auth.js
import jwt from "jsonwebtoken";
import { SuperAdmin } from "../models/SuperAdmin.js";

// ── Protect super admin routes ────────────────────────────────────────────────
export const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized — no token" });
  }
  try {
    const token   = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.DAB_JWT_SECRET);
    req.admin     = await SuperAdmin.findById(decoded.id).select("-password");
    if (!req.admin) return res.status(401).json({ message: "Admin not found" });
    if (!req.admin.isActive) return res.status(403).json({ message: "Account deactivated" });
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ── Restaurant-to-DAB API key verification ────────────────────────────────────
// Restaurant servers call DAB using their apiKey to verify plan
export const restaurantApiKey = async (req, res, next) => {
  const { Restaurant } = await import("../models/Restaurant.js");
  const key = req.headers["x-dab-api-key"];
  if (!key) return res.status(401).json({ message: "API key required" });

  const restaurant = await Restaurant.findOne({ apiKey: key });
  if (!restaurant) return res.status(401).json({ message: "Invalid API key" });
  if (restaurant.status === "suspended") {
    return res.status(403).json({
      message: "Restaurant suspended",
      reason: restaurant.suspendReason || "Contact DAB support",
    });
  }

  req.restaurant = restaurant;
  next();
};
