// controllers/planController.js
import { Plan } from "../models/Plan.js";

// ── GET /api/plans ────────────────────────────────────────────────────────────
export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ sortOrder: 1 });
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/plans/:id ────────────────────────────────────────────────────────
export const getPlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/plans ───────────────────────────────────────────────────────────
export const createPlan = async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.status(201).json({ plan });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── PUT /api/plans/:id ────────────────────────────────────────────────────────
export const updatePlan = async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── DELETE /api/plans/:id ─────────────────────────────────────────────────────
export const deletePlan = async (req, res) => {
  try {
    const { Restaurant } = await import("../models/Restaurant.js");
    const inUse = await Restaurant.countDocuments({ plan: req.params.id });
    if (inUse > 0)
      return res.status(400).json({ message: `Cannot delete — ${inUse} restaurant(s) using this plan` });
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
