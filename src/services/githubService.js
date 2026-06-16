import axios from "axios";

const githubApi = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Accept: "application/vnd.github.v3+json",
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  },
  timeout: 10000,
});

/**
 * Fetch basic user profile from GitHub
 */
async function fetchUserProfile(username) {
  const { data } = await githubApi.get(`/users/${username}`);
  return data;
}

/**
 * Fetch all public repos (handles pagination)
 */
async function fetchUserRepos(username) {
  const repos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await githubApi.get(`/users/${username}/repos`, {
      params: { per_page: perPage, page, sort: "updated" },
    });
    repos.push(...data);
    if (data.length < perPage) break;
    page++;
    if (page > 10) break; // safety cap: max 1000 repos
  }

  return repos;
}

/**
 * Fetch latest public event to gauge activity
 */
async function fetchLatestEvent(username) {
  try {
    const { data } = await githubApi.get(`/users/${username}/events/public`, {
      params: { per_page: 1 },
    });
    return data[0] || null;
  } catch {
    return null;
  }
}

/**
 * Compute derived insights from raw GitHub data
 */
function computeInsights(profile, repos) {
  // --- Language breakdown ---
  const langCount = {};
  repos.forEach((r) => {
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  });
  const top_languages = Object.fromEntries(
    Object.entries(langCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
  );

  // --- Topics aggregation ---
  const topicCount = {};
  repos.forEach((r) => {
    (r.topics || []).forEach((t) => {
      topicCount[t] = (topicCount[t] || 0) + 1;
    });
  });
  const repo_topics = Object.fromEntries(
    Object.entries(topicCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
  );

  // --- Stars & forks ---
  const originalRepos = repos.filter((r) => !r.fork);
  const total_stars_received = originalRepos.reduce((s, r) => s + r.stargazers_count, 0);
  const total_forks_received = originalRepos.reduce((s, r) => s + r.forks_count, 0);

  const mostStarred = [...originalRepos].sort(
    (a, b) => b.stargazers_count - a.stargazers_count
  )[0];
  const mostForked = [...originalRepos].sort(
    (a, b) => b.forks_count - a.forks_count
  )[0];

  // --- Account age ---
  const createdAt = new Date(profile.created_at);
  const now = new Date();
  const account_age_days = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
  const yearsOld = account_age_days / 365 || 1;

  // --- Ratios ---
  const follower_following_ratio = profile.following > 0
    ? parseFloat((profile.followers / profile.following).toFixed(4))
    : profile.followers;

  const repos_per_year = parseFloat((profile.public_repos / yearsOld).toFixed(2));

  // --- Influence score (0–1000 weighted formula) ---
  const influence_score = parseFloat(
    Math.min(
      1000,
      profile.followers * 2 +
        total_stars_received * 3 +
        total_forks_received * 2 +
        profile.public_repos * 0.5
    ).toFixed(2)
  );

  // --- Profile completeness (0–100) ---
  const fields = [
    profile.name,
    profile.bio,
    profile.company,
    profile.blog,
    profile.location,
    profile.email,
    profile.twitter_username,
    profile.avatar_url,
  ];
  const filled = fields.filter(Boolean).length;
  const profile_completeness = Math.round((filled / fields.length) * 100);

  return {
    top_languages,
    repo_topics,
    total_stars_received,
    total_forks_received,
    most_starred_repo: mostStarred?.name || null,
    most_forked_repo: mostForked?.name || null,
    account_age_days,
    follower_following_ratio,
    repos_per_year,
    influence_score,
    profile_completeness,
  };
}

export { fetchUserProfile, fetchUserRepos, fetchLatestEvent, computeInsights };
