import {
  analyzeProfile,
  getAllProfiles,
  getProfileByUsername,
  deleteProfile,
} from "../services/profileService.js";

/**
 * POST /api/profiles/analyze/:username
 * Fetch from GitHub, compute insights, store in DB, return result
 */
async function analyze(req, res) {
  try {
    const { username } = req.params;
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "Invalid GitHub username format" });
    }

    const profile = await analyzeProfile(username);
    const statusCode = profile ? 200 : 201;
    return res.status(statusCode).json({
      message: "Profile analyzed and stored successfully",
      profile,
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: `GitHub user '${req.params.username}' not found` });
    }
    if (err.response?.status === 403) {
      return res.status(429).json({ error: "GitHub API rate limit exceeded. Add a GITHUB_TOKEN to your .env to increase limits." });
    }
    console.error("analyze error:", err.message);
    return res.status(500).json({ error: "Failed to analyze profile", detail: err.message });
  }
}

/**
 * GET /api/profiles
 * List all stored profiles with pagination + sorting
 */
async function listProfiles(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const sort = req.query.sort || "analyzed_at";
    const order = req.query.order || "desc";

    const result = await getAllProfiles({ page, limit, sort, order });
    return res.json(result);
  } catch (err) {
    console.error("listProfiles error:", err.message);
    return res.status(500).json({ error: "Failed to fetch profiles" });
  }
}

/**
 * GET /api/profiles/:username
 * Full detail for a single stored profile
 */
async function getProfile(req, res) {
  try {
    const { username } = req.params;
    const profile = await getProfileByUsername(username);
    if (!profile) {
      return res.status(404).json({
        error: `Profile '${username}' not found. Use POST /api/profiles/analyze/${username} to analyze it first.`,
      });
    }
    return res.json({ profile });
  } catch (err) {
    console.error("getProfile error:", err.message);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
}

/**
 * DELETE /api/profiles/:username
 * Remove a profile from the database
 */
async function removeProfile(req, res) {
  try {
    const { username } = req.params;
    const deleted = await deleteProfile(username);
    if (!deleted) {
      return res.status(404).json({ error: `Profile '${username}' not found` });
    }
    return res.json({ message: `Profile '${username}' deleted successfully` });
  } catch (err) {
    console.error("removeProfile error:", err.message);
    return res.status(500).json({ error: "Failed to delete profile" });
  }
}

// GitHub usernames: 1–39 chars, alphanumeric + hyphens, no leading/trailing hyphens
function isValidUsername(username) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username);
}

export { analyze, listProfiles, getProfile, removeProfile };
