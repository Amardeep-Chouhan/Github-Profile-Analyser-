-- GitHub Profile Analyzer Database Schema
-- Run this file to set up the database

CREATE DATABASE IF NOT EXISTS github_analyzer;
USE github_analyzer;

-- Core profile table
CREATE TABLE IF NOT EXISTS profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200),
  bio TEXT,
  avatar_url VARCHAR(500),
  github_url VARCHAR(300),
  company VARCHAR(200),
  blog VARCHAR(300),
  location VARCHAR(200),
  email VARCHAR(200),
  twitter_username VARCHAR(100),
  hireable BOOLEAN,
  created_at_github DATETIME,

  -- Engagement metrics
  public_repos INT DEFAULT 0,
  public_gists INT DEFAULT 0,
  followers INT DEFAULT 0,
  following INT DEFAULT 0,

  -- Derived insights
  follower_following_ratio DECIMAL(10, 4) DEFAULT 0,
  account_age_days INT DEFAULT 0,
  repos_per_year DECIMAL(10, 2) DEFAULT 0,
  influence_score DECIMAL(10, 2) DEFAULT 0,     -- weighted score based on followers, stars, forks
  profile_completeness INT DEFAULT 0,            -- 0-100% how complete the profile is

  -- Language & repo stats (stored as JSON)
  top_languages JSON,                            -- e.g. {"JavaScript": 12, "Python": 5}
  repo_topics JSON,                              -- aggregated topics across repos

  -- Star / fork aggregates
  total_stars_received INT DEFAULT 0,
  total_forks_received INT DEFAULT 0,
  most_starred_repo VARCHAR(200),
  most_forked_repo VARCHAR(200),

  -- Activity
  last_github_event_at DATETIME,
  is_active BOOLEAN DEFAULT TRUE,               -- had activity in last 6 months

  -- Meta
  analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_username (username),
  INDEX idx_influence_score (influence_score),
  INDEX idx_followers (followers)
);

-- Store individual repo snapshots per analysis
CREATE TABLE IF NOT EXISTS profile_repos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_id INT NOT NULL,
  repo_name VARCHAR(200),
  repo_full_name VARCHAR(300),
  description TEXT,
  language VARCHAR(100),
  stars INT DEFAULT 0,
  forks INT DEFAULT 0,
  watchers INT DEFAULT 0,
  open_issues INT DEFAULT 0,
  is_fork BOOLEAN DEFAULT FALSE,
  created_at_github DATETIME,
  pushed_at DATETIME,
  topics JSON,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_profile_id (profile_id),
  INDEX idx_stars (stars)
);

-- Analysis history (each time a username is re-analyzed)
CREATE TABLE IF NOT EXISTS analysis_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_id INT NOT NULL,
  analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  followers_snapshot INT,
  following_snapshot INT,
  public_repos_snapshot INT,
  total_stars_snapshot INT,
  influence_score_snapshot DECIMAL(10, 2),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_profile_id (profile_id)
);
