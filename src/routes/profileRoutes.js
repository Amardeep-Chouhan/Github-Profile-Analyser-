import { Router } from "express";
import { analyze, listProfiles, getProfile, removeProfile } from "../controllers/profileController.js";

const router = Router();

// Analyze (or re-analyze) a GitHub profile
router.post("/analyze/:username", analyze);

// List all stored profiles
router.get("/", listProfiles);

// Get a single stored profile by username
router.get("/:username", getProfile);

// Delete a stored profile
router.delete("/:username", removeProfile);

export default router;
