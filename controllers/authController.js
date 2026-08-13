// controllers/authController.js
import jwt from "jsonwebtoken";
import { SuperAdmin } from "../models/SuperAdmin.js";

const signToken = (id) =>
  jwt.sign({ id }, process.env.DAB_JWT_SECRET, {
    expiresIn: process.env.DAB_JWT_EXPIRES || "7d",
  });

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const admin = await SuperAdmin.findOne({ email: email.toLowerCase() }).select("+password");
    if (!admin || !(await admin.comparePassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });

    if (!admin.isActive)
      return res.status(403).json({ message: "Account deactivated" });

    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    const token = signToken(admin._id);
    res.json({
      token,
      admin: {
        _id:      admin._id,
        name:     admin.name,
        email:    admin.email,
        role:     admin.role,
        lastLogin:admin.lastLogin,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  res.json({ admin: req.admin });
};

// ── POST /api/auth/change-password ───────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await SuperAdmin.findById(req.admin._id).select("+password");
    if (!(await admin.comparePassword(currentPassword)))
      return res.status(400).json({ message: "Current password is incorrect" });
    admin.password = newPassword;
    await admin.save();
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
