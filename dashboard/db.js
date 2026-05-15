const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'reviews.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS prs (
      id INTEGER PRIMARY KEY,
      title TEXT,
      author TEXT,
      branch TEXT,
      base_branch TEXT DEFAULT 'main',
      url TEXT,
      created_at TEXT,
      status TEXT,
      is_draft INTEGER DEFAULT 0,
      is_insider INTEGER,
      last_reviewed_commit TEXT,
      last_review_date TEXT,
      tracking_file_path TEXT,
      location TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pr_id INTEGER REFERENCES prs(id),
      cycle_number INTEGER,
      type TEXT,
      status TEXT DEFAULT 'completed',
      started_at TEXT,
      ended_at TEXT,
      duration_seconds INTEGER,
      commit_sha TEXT,
      gates TEXT,
      areas_changed TEXT,
      findings_critical INTEGER DEFAULT 0,
      findings_major INTEGER DEFAULT 0,
      findings_minor INTEGER DEFAULT 0,
      action_taken TEXT,
      github_review_url TEXT,
      coderabbit_dedup TEXT,
      log_file_path TEXT,
      reviewer TEXT DEFAULT 'graycyrus',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT,
      ended_at TEXT,
      duration_seconds INTEGER,
      prs_discovered INTEGER,
      prs_reviewed INTEGER,
      prs_skipped INTEGER,
      prs_failed INTEGER,
      log_file_path TEXT
    );

    CREATE TABLE IF NOT EXISTS pr_github (
      pr_id INTEGER PRIMARY KEY REFERENCES prs(id),
      is_draft INTEGER DEFAULT 0,
      review_decision TEXT,
      mergeable TEXT,
      merge_state_status TEXT,
      additions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      changed_files INTEGER DEFAULT 0,
      labels TEXT,
      reviewers TEXT,
      assignees TEXT,
      updated_at_gh TEXT,
      last_synced TEXT,
      is_open INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_prs_status ON prs(status);
    CREATE INDEX IF NOT EXISTS idx_cycles_pr ON review_cycles(pr_id);
    CREATE INDEX IF NOT EXISTS idx_pr_github_open ON pr_github(is_open);
  `);

  return _db;
}

// --- PR queries ---

const prQueries = {
  upsert: `INSERT INTO prs (id, title, author, branch, base_branch, url, created_at, status, is_insider, last_reviewed_commit, last_review_date, tracking_file_path, location, updated_at)
    VALUES (@id, @title, @author, @branch, @base_branch, @url, @created_at, @status, @is_insider, @last_reviewed_commit, @last_review_date, @tracking_file_path, @location, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title=@title, author=@author, branch=@branch, base_branch=@base_branch, url=@url,
      status=@status, is_insider=@is_insider, last_reviewed_commit=@last_reviewed_commit,
      last_review_date=@last_review_date, tracking_file_path=@tracking_file_path,
      location=@location, updated_at=datetime('now')`,

  getAll: `SELECT * FROM prs ORDER BY id DESC`,

  getById: `SELECT * FROM prs WHERE id = ?`,

  getStats: `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN g.is_draft = 1 THEN 1 ELSE 0 END) as drafts,
    SUM(CASE WHEN p.status = 'under-review' THEN 1 ELSE 0 END) as under_review,
    SUM(CASE WHEN p.status = 'changes-requested' THEN 1 ELSE 0 END) as changes_requested,
    SUM(CASE WHEN p.status = 'clean' THEN 1 ELSE 0 END) as clean,
    SUM(CASE WHEN p.status = 'blocked' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN g.is_open = 0 THEN 1 ELSE 0 END) as closed
    FROM prs p
    LEFT JOIN pr_github g ON g.pr_id = p.id`,
};

const cycleQueries = {
  deleteForPr: `DELETE FROM review_cycles WHERE pr_id = ?`,

  insert: `INSERT INTO review_cycles (pr_id, cycle_number, type, status, started_at, ended_at, duration_seconds, commit_sha, gates, areas_changed, findings_critical, findings_major, findings_minor, action_taken, github_review_url, coderabbit_dedup, log_file_path, reviewer, updated_at)
    VALUES (@pr_id, @cycle_number, @type, @status, @started_at, @ended_at, @duration_seconds, @commit_sha, @gates, @areas_changed, @findings_critical, @findings_major, @findings_minor, @action_taken, @github_review_url, @coderabbit_dedup, @log_file_path, @reviewer, datetime('now'))`,

  getByPr: `SELECT * FROM review_cycles WHERE pr_id = ? ORDER BY cycle_number ASC`,
};

const cronQueries = {
  insert: `INSERT INTO cron_runs (started_at, ended_at, duration_seconds, prs_discovered, prs_reviewed, prs_skipped, prs_failed, log_file_path)
    VALUES (@started_at, @ended_at, @duration_seconds, @prs_discovered, @prs_reviewed, @prs_skipped, @prs_failed, @log_file_path)`,

  getAll: `SELECT * FROM cron_runs ORDER BY started_at DESC`,
};

function upsertPr(data) {
  const db = getDb();
  return db.prepare(prQueries.upsert).run(data);
}

function getAllPrs() {
  const db = getDb();
  return db.prepare(prQueries.getAll).all();
}

function getPrById(id) {
  const db = getDb();
  return db.prepare(prQueries.getById).get(id);
}

function getStats() {
  const db = getDb();
  return db.prepare(prQueries.getStats).get();
}

function replaceCyclesForPr(prId, cycles) {
  const db = getDb();
  const deleteStmt = db.prepare(cycleQueries.deleteForPr);
  const insertStmt = db.prepare(cycleQueries.insert);

  const tx = db.transaction((prId, cycles) => {
    deleteStmt.run(prId);
    for (const cycle of cycles) {
      insertStmt.run({ ...cycle, pr_id: prId });
    }
  });

  tx(prId, cycles);
}

function getCyclesByPr(prId) {
  const db = getDb();
  return db.prepare(cycleQueries.getByPr).all(prId);
}

function insertCronRun(data) {
  const db = getDb();
  return db.prepare(cronQueries.insert).run(data);
}

function getAllCronRuns() {
  const db = getDb();
  return db.prepare(cronQueries.getAll).all();
}

function getPrsWithLatestCycle() {
  const db = getDb();
  return db.prepare(`
    SELECT p.*,
      g.is_draft as gh_is_draft,
      g.review_decision,
      g.mergeable,
      g.merge_state_status,
      g.additions,
      g.deletions,
      g.changed_files,
      g.labels,
      g.reviewers,
      g.assignees,
      g.updated_at_gh,
      g.is_open,
      rc.cycle_number as latest_cycle,
      rc.status as cycle_status,
      rc.started_at as cycle_started,
      rc.ended_at as cycle_ended,
      rc.duration_seconds as cycle_duration,
      rc.findings_critical,
      rc.findings_major,
      rc.findings_minor,
      rc.action_taken
    FROM prs p
    LEFT JOIN pr_github g ON g.pr_id = p.id
    LEFT JOIN review_cycles rc ON rc.pr_id = p.id
      AND rc.cycle_number = (SELECT MAX(rc2.cycle_number) FROM review_cycles rc2 WHERE rc2.pr_id = p.id)
    ORDER BY p.id DESC
  `).all();
}

function getPrByIdFull(id) {
  const db = getDb();
  return db.prepare(`
    SELECT p.*,
      g.is_draft as gh_is_draft,
      g.review_decision,
      g.mergeable,
      g.merge_state_status,
      g.additions,
      g.deletions,
      g.changed_files,
      g.labels,
      g.reviewers,
      g.assignees,
      g.updated_at_gh,
      g.is_open
    FROM prs p
    LEFT JOIN pr_github g ON g.pr_id = p.id
    WHERE p.id = ?
  `).get(id);
}

function upsertPrGithub(data) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO pr_github (pr_id, is_draft, review_decision, mergeable, merge_state_status, additions, deletions, changed_files, labels, reviewers, assignees, updated_at_gh, last_synced, is_open)
    VALUES (@pr_id, @is_draft, @review_decision, @mergeable, @merge_state_status, @additions, @deletions, @changed_files, @labels, @reviewers, @assignees, @updated_at_gh, @last_synced, 1)
    ON CONFLICT(pr_id) DO UPDATE SET
      is_draft=@is_draft, review_decision=@review_decision, mergeable=@mergeable,
      merge_state_status=@merge_state_status, additions=@additions, deletions=@deletions,
      changed_files=@changed_files, labels=@labels, reviewers=@reviewers, assignees=@assignees,
      updated_at_gh=@updated_at_gh, last_synced=@last_synced, is_open=1
  `).run(data);
}

function markClosedPrs(openPrIds) {
  const db = getDb();
  if (openPrIds.length === 0) return;
  const placeholders = openPrIds.map(() => '?').join(',');
  db.prepare(`UPDATE pr_github SET is_open = 0 WHERE pr_id NOT IN (${placeholders}) AND is_open = 1`).run(...openPrIds);
}

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = {
  getDb,
  upsertPr,
  upsertPrGithub,
  getAllPrs,
  getPrById,
  getPrByIdFull,
  getStats,
  replaceCyclesForPr,
  getCyclesByPr,
  insertCronRun,
  getAllCronRuns,
  getPrsWithLatestCycle,
  markClosedPrs,
  close,
};
