import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import profileRoutes from "./routes/profileRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();

// --- Security & parsing ---
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Logging ---
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// --- Rate limiting ---
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

// --- Health check ---
app.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// --- API routes ---
app.use("/api/profiles", profileRoutes);

// --- API docs (inline) ---
app.get("/", (req, res) => {
  res.json({
    name: "GitHub Profile Analyzer API",
    version: "1.0.0",
    endpoints: {
      "POST /api/profiles/analyze/:username": "Analyze a GitHub user and store insights",
      "GET  /api/profiles":                   "List all analyzed profiles (supports ?page, ?limit, ?sort, ?order)",
      "GET  /api/profiles/:username":          "Get full detail for a stored profile",
      "DELETE /api/profiles/:username":        "Remove a stored profile",
      "GET  /health":                          "Health check",
    },
    sortable_fields: ["analyzed_at", "followers", "influence_score", "public_repos", "total_stars_received", "username"],
  });
});

// --- 404 & error handlers (must be last) ---
app.use(notFound);
app.use(errorHandler);

export default app;