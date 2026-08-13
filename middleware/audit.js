// middleware/audit.js — log every action automatically
import { AuditLog } from "../models/AuditLog.js";

export const audit = (action) => async (req, res, next) => {
  // Store original json to intercept response
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    try {
      await AuditLog.create({
        actor:   req.admin?.email || "system",
        actorId: req.admin?._id,
        action,
        target:  req.params?.slug || req.params?.id || req.body?.slug || req.body?.name,
        ip:      req.ip,
        success: res.statusCode < 400,
        error:   res.statusCode >= 400 ? data?.message : undefined,
        details: { body: req.body, params: req.params },
      });
    } catch (e) {
      console.warn("Audit log failed:", e.message);
    }
    return originalJson(data);
  };
  next();
};
