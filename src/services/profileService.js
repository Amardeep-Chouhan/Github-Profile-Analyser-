import { pool } from "../config/database.js";
import {
  fetchUserProfile,
  fetchUserRepos,
  fetchLatestEvent,
  computeInsights,
} from "./githubService.js";

/**
 * Analyze a GitHub username: fetch from GitHub, compute insights, upsert into DB
 */
async function analyzeProfile(username) {
  // 1. Fetch from GitHub
  const [ghProfile, repos, latestEvent] = await Promise.all([
    fetchUserProfile(username),
    fetchUserRepos(username),
    fetchLatestEvent(username),
  ]);

  // 2. Compute derived insights
  const insights = computeInsights(ghProfile, repos);

  // 3. Determine activity status (any event in last 6 months)
  const lastEventAt = latestEvent ? new Date(latestEvent.created_at) : null;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const is_active = lastEventAt ? lastEventAt >= sixMonthsAgo : false;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 4. Upsert core profile
    const [upsertResult] = await conn.execute(
      `INSERT INTO profiles (
        username, name, bio, avatar_url, github_url, company, blog, location,
        email, twitter_username, hireable, created_at_github,
        public_repos, public_gists, followers, following,
        follower_following_ratio, account_age_days, repos_per_year, influence_score, profile_completeness,
        top_languages, repo_topics,
        total_stars_received, total_forks_received, most_starred_repo, most_forked_repo,
        last_github_event_at, is_active, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), bio=VALUES(bio), avatar_url=VALUES(avatar_url),
        github_url=VALUES(github_url), company=VALUES(company), blog=VALUES(blog),
        location=VALUES(location), email=VALUES(email), twitter_username=VALUES(twitter_username),
        hireable=VALUES(hireable), created_at_github=VALUES(created_at_github),
        public_repos=VALUES(public_repos), public_gists=VALUES(public_gists),
        followers=VALUES(followers), following=VALUES(following),
        follower_following_ratio=VALUES(follower_following_ratio),
        account_age_days=VALUES(account_age_days), repos_per_year=VALUES(repos_per_year),
        influence_score=VALUES(influence_score), profile_completeness=VALUES(profile_completeness),
        top_languages=VALUES(top_languages), repo_topics=VALUES(repo_topics),
        total_stars_received=VALUES(total_stars_received), total_forks_received=VALUES(total_forks_received),
        most_starred_repo=VALUES(most_starred_repo), most_forked_repo=VALUES(most_forked_repo),
        last_github_event_at=VALUES(last_github_event_at), is_active=VALUES(is_active),
        analyzed_at=NOW()`,
      [
        ghProfile.login,
        ghProfile.name,
        ghProfile.bio,
        ghProfile.avatar_url,
        ghProfile.html_url,
        ghProfile.company,
        ghProfile.blog,
        ghProfile.location,
        ghProfile.email,
        ghProfile.twitter_username,
        ghProfile.hireable,
        new Date(ghProfile.created_at),
        ghProfile.public_repos,
        ghProfile.public_gists,
        ghProfile.followers,
        ghProfile.following,
        insights.follower_following_ratio,
        insights.account_age_days,
        insights.repos_per_year,
        insights.influence_score,
        insights.profile_completeness,
        JSON.stringify(insights.top_languages),
        JSON.stringify(insights.repo_topics),
        insights.total_stars_received,
        insights.total_forks_received,
        insights.most_starred_repo,
        insights.most_forked_repo,
        lastEventAt,
        is_active,
      ]
    );

    // Get the profile id
    let profileId;
    if (upsertResult.insertId && upsertResult.insertId !== 0) {
      profileId = upsertResult.insertId;
    } else {
      const [[row]] = await conn.execute(
        "SELECT id FROM profiles WHERE username = ?",
        [ghProfile.login]
      );
      profileId = row.id;
    }

    // 5. Replace repo snapshots
    await conn.execute("DELETE FROM profile_repos WHERE profile_id = ?", [profileId]);
    if (repos.length > 0) {
      const repoValues = repos.map((r) => [
        profileId,
        r.name,
        r.full_name,
        r.description,
        r.language,
        r.stargazers_count,
        r.forks_count,
        r.watchers_count,
        r.open_issues_count,
        r.fork ? 1 : 0,
        r.created_at ? new Date(r.created_at) : null,
        r.pushed_at ? new Date(r.pushed_at) : null,
        JSON.stringify(r.topics || []),
      ]);

      const placeholders = repoValues.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO profile_repos
          (profile_id, repo_name, repo_full_name, description, language, stars, forks,
           watchers, open_issues, is_fork, created_at_github, pushed_at, topics)
         VALUES ${placeholders}`,
        repoValues.flat()
      );
    }

    // 6. Append to analysis history
    await conn.execute(
      `INSERT INTO analysis_history
        (profile_id, followers_snapshot, following_snapshot, public_repos_snapshot,
         total_stars_snapshot, influence_score_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        profileId,
        ghProfile.followers,
        ghProfile.following,
        ghProfile.public_repos,
        insights.total_stars_received,
        insights.influence_score,
      ]
    );

    await conn.commit();
    return await getProfileByUsername(ghProfile.login);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Return all analyzed profiles with summary fields
 */
async function getAllProfiles({ page = 1, limit = 20, sort = "analyzed_at", order = "desc" } = {}) {
  const allowedSorts = ["analyzed_at", "followers", "influence_score", "public_repos", "total_stars_received", "username"];
  const allowedOrders = ["asc", "desc"];
  const safeSort = allowedSorts.includes(sort) ? sort : "analyzed_at";
  const safeOrder = allowedOrders.includes(order.toLowerCase()) ? order.toUpperCase() : "DESC";

  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM profiles");
  const [rows] = await pool.query(
    `SELECT
       id, username, name, avatar_url, github_url, location,
       public_repos, followers, following, total_stars_received,
       influence_score, profile_completeness, is_active,
       account_age_days, top_languages, analyzed_at
     FROM profiles
     ORDER BY ${safeSort} ${safeOrder}
     LIMIT ${limit} OFFSET ${offset}`
  );
  

  return {
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    profiles: rows.map(parseJsonFields),
  };
}

/**
 * Return full profile detail including repos and analysis history
 */
async function getProfileByUsername(username) {
  const [[profile]] = await pool.execute(
    "SELECT * FROM profiles WHERE username = ?",
    [username]
  );
  if (!profile) return null;

  const [repos] = await pool.execute(
    `SELECT * FROM profile_repos WHERE profile_id = ? ORDER BY stars DESC LIMIT 30`,
    [profile.id]
  );

  const [history] = await pool.execute(
    `SELECT analyzed_at, followers_snapshot, following_snapshot,
            public_repos_snapshot, total_stars_snapshot, influence_score_snapshot
     FROM analysis_history WHERE profile_id = ? ORDER BY analyzed_at DESC LIMIT 10`,
    [profile.id]
  );

  return {
    ...parseJsonFields(profile),
    top_repos: repos.map(parseJsonFields),
    analysis_history: history,
  };
}

/**
 * Delete a profile and all related data
 */
async function deleteProfile(username) {
  const [[profile]] = await pool.execute(
    "SELECT id FROM profiles WHERE username = ?",
    [username]
  );
  if (!profile) return false;
  await pool.execute("DELETE FROM profiles WHERE id = ?", [profile.id]);
  return true;
}

// Parse JSON columns returned as strings
function parseJsonFields(row) {
  const jsonCols = ["top_languages", "repo_topics", "topics"];
  const result = { ...row };
  jsonCols.forEach((col) => {
    if (result[col] && typeof result[col] === "string") {
      try { result[col] = JSON.parse(result[col]); } catch { /* ignore */ }
    }
  });
  return result;
}

export { analyzeProfile, getAllProfiles, getProfileByUsername, deleteProfile };
