# GitHub Profile Analyzer API

A backend REST API built with **Node.js**, **Express.js**, and **MySQL** that fetches public GitHub profiles, computes rich developer insights, and stores them for querying.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js + Express.js | REST API server |
| MySQL (via mysql2) | Persistent storage with connection pool |
| GitHub REST API v3 | Public profile & repository data |
| Axios | HTTP client for GitHub requests |
| Aiven | Cloud MySQL database hosting |
| Render | API deployment platform |
| Helmet / CORS / express-rate-limit | Security & rate limiting |

---

## Project Structure

```
github-profile-analyzer/
├── index.js                          # Server entry point
├── sql/
│   └── schema.sql                    # Database schema
└── src/
    ├── app.js                        # Express app setup
    ├── config/
    │   └── database.js               # MySQL connection pool
    ├── controllers/
    │   └── profileController.js      # Request/response handling
    ├── middleware/
    │   └── errorHandler.js           # Error & 404 handling
    ├── routes/
    │   └── profileRoutes.js          # API route definitions
    └── services/
        ├── githubService.js          # GitHub API calls & insight computation
        └── profileService.js         # Database operations
```

---

## Local Setup Instructions

### Prerequisites
- Node.js v18+
- MySQL client installed
- A GitHub Personal Access Token (recommended)
- An Aiven account (for cloud MySQL) or local MySQL

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/github-profile-analyzer.git
cd github-profile-analyzer
```

---

### Step 2 — Install dependencies

```bash
npm install
```

---

### Step 3 — Configure environment variables

Open `.env` and fill in your values:

```env
# Server
PORT=3000
NODE_ENV=development

# MySQL Database (Aiven)
DB_HOST=your-host.aivencloud.com
DB_PORT=15584
DB_USER=avnadmin
DB_PASSWORD=your_aiven_password
DB_NAME=github_analyzer
DB_SSL=true

# GitHub Token (get from github.com/settings/tokens)
# Increases API rate limit from 60 to 5000 requests/hour
GITHUB_TOKEN=ghp_your_token_here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

> **How to get a GitHub Token:**
> Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens → Generate new token → Select **Public Repositories (read-only)** under permissions.

---

### Step 4 — Set up the database

**Option A — Using the npm script (recommended):**
```bash
npm run db:init
```

**Option B — Using MySQL terminal manually:**
```bash
mysql -h YOUR_HOST -P YOUR_PORT -u avnadmin -p --ssl-mode=REQUIRED github_analyzer
```
Then inside MySQL:
```sql
source sql/schema.sql
```

Verify tables were created:
```sql
SHOW TABLES;
```

You should see:
```
+---------------------------+
| Tables_in_github_analyzer |
+---------------------------+
| analysis_history          |
| profile_repos             |
| profiles                  |
+---------------------------+
```

---

### Step 5 — Run the server

```bash
npm start
```

You should see:
```
✅ MySQL connected successfully
🚀 GitHub Profile Analyzer running on http://localhost:3000
```

---

## API Reference

### Base URL
- **Local:** `http://localhost:3000`
- **Production:** `https://your-app.onrender.com`

---

### `POST /api/profiles/analyze/:username`
Fetches a GitHub user's profile and repositories, computes insights, and stores everything in the database. Re-analyzing an existing username updates the record and appends a history entry.

**Example:**
```
POST /api/profiles/analyze/torvalds
```

**Response:**
```json
{
  "message": "Profile analyzed and stored successfully",
  "profile": {
    "username": "torvalds",
    "name": "Linus Torvalds",
    "followers": 307628,
    "public_repos": 12,
    "total_stars_received": 247812,
    "influence_score": "1000.00",
    "profile_completeness": 50,
    "top_languages": { "C": 10, "C++": 1 },
    "most_starred_repo": "linux",
    "is_active": 1,
    "top_repos": [...],
    "analysis_history": [...]
  }
}
```

---

### `GET /api/profiles`
Returns all stored analyzed profiles. Supports pagination and sorting.

**Query Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Results per page (max 100) |
| `sort` | `analyzed_at` | Sort by: `analyzed_at`, `followers`, `influence_score`, `public_repos`, `total_stars_received`, `username` |
| `order` | `desc` | `asc` or `desc` |

**Example:**
```
GET /api/profiles?sort=influence_score&order=desc&limit=10
```

**Response:**
```json
{
  "total": 5,
  "page": 1,
  "limit": 10,
  "total_pages": 1,
  "profiles": [...]
}
```

---

### `GET /api/profiles/:username`
Returns full stored details for a single profile including top repositories and analysis history.

**Example:**
```
GET /api/profiles/torvalds
```

---

### `DELETE /api/profiles/:username`
Removes a stored profile and all related data from the database.

**Example:**
```
DELETE /api/profiles/torvalds
```

**Response:**
```json
{
  "message": "Profile 'torvalds' deleted successfully"
}
```

---

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-16T09:00:00.000Z"
}
```

---

## Database Schema

### `profiles` — Core profile table
| Column | Type | Description |
|--------|------|-------------|
| `username` | VARCHAR | GitHub login (unique) |
| `public_repos` | INT | Total public repositories |
| `followers` / `following` | INT | Social counts |
| `follower_following_ratio` | DECIMAL | followers ÷ following |
| `total_stars_received` | INT | Sum of stars across original repos |
| `total_forks_received` | INT | Sum of forks across original repos |
| `influence_score` | DECIMAL | Weighted score capped at 1000 |
| `profile_completeness` | INT | Profile fill percentage (0–100) |
| `top_languages` | JSON | Language → repo count map |
| `repo_topics` | JSON | Aggregated topics across repos |
| `account_age_days` | INT | Days since GitHub account creation |
| `repos_per_year` | DECIMAL | public_repos ÷ account age in years |
| `most_starred_repo` | VARCHAR | Name of most starred repository |
| `most_forked_repo` | VARCHAR | Name of most forked repository |
| `is_active` | BOOLEAN | Had public activity in last 6 months |
| `analyzed_at` | DATETIME | Last analysis timestamp |

### `profile_repos` — Repository snapshots
Stores all public repos per user: name, stars, forks, language, topics, and last push date.

### `analysis_history` — Time series tracking
Every analysis appends a row with follower, star, and influence score snapshots — enabling growth tracking over time.

---

## Insights Explained

| Insight | Formula / Logic |
|---------|----------------|
| **Influence Score** | `min(1000, followers×2 + stars×3 + forks×2 + repos×0.5)` |
| **Profile Completeness** | `filled_fields / 8 × 100` (checks 8 profile fields) |
| **Repos per Year** | `public_repos / account_age_years` |
| **Follower/Following Ratio** | `followers / following` |
| **Active Status** | Any public GitHub event within the last 6 months |

---

## Features Beyond Requirements

1. **Influence Score** — Custom weighted developer ranking metric
2. **Analysis History** — Growth tracking across multiple analyses
3. **Per-Repository Breakdown** — Separate table for individual repo data
4. **Language & Topic Aggregation** — Tech stack insights stored as JSON
5. **Activity Status** — Identifies active vs inactive developers
6. **Pagination & Sorting** — Full control over list API results
7. **Re-analysis with Upsert** — Updates existing records without duplicates
8. **DELETE Endpoint** — Complete CRUD support
9. **Security Hardening** — Rate limiting, Helmet headers, CORS, input validation

---

## Deployment

- **API:** Deployed on [Render](https://render.com)
- **Database:** Hosted on [Aiven](https://aiven.io) (Cloud MySQL)
- **Live URL:** `https://your-app.onrender.com`
