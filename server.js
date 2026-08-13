// server.js — DAB (Dokan in a Box) Super Admin Backend
import dns from "node:dns";
// import http from "http";
// import { Server } from "socket.io";
dns.setServers(["1.1.1.1", "8.8.8.8"]);
import "dotenv/config";
import express     from "express";
import cors        from "cors";
import mongoose    from "mongoose";
import { connectMasterDB } from "./config/db.js";
import { seedDefaults }    from "./utils/seed.js";
import routes              from "./routes/index.js";

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (Postman, curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger (dev only) ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    name:    "DAB — Dokan in a Box",
    version: "1.0.0",
    status:  "running",
    db:      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time:    new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const start = async () => {
  await connectMasterDB();
  await seedDefaults();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║      DAB — Dokan in a Box Server             ║
║      Running on port ${PORT}                    ║
║      DB: ${process.env.DAB_MONGO_URI?.slice(0, 30)}...  ║
╚══════════════════════════════════════════════╝
    `);
  });
};

start().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
