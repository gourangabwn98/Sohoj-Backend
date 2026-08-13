// models/AuditLog.js — tracks every DAB super admin action
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor:      { type: String, required: true }, // super admin name/email
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
    action:     { type: String, required: true }, // e.g. "RESTAURANT_CREATED"
    target:     { type: String },                 // e.g. restaurant name/slug
    targetId:   { type: mongoose.Schema.Types.ObjectId },
    details:    { type: mongoose.Schema.Types.Mixed }, // extra data
    ip:         { type: String },
    success:    { type: Boolean, default: true },
    error:      { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1 });
auditLogSchema.index({ action: 1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
