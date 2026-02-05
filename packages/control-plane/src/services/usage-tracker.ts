/**
 * Usage tracker service - logs API usage to SQLite for cost tracking.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const STATE_DIR = process.env.APP_DIR ? path.join(process.env.APP_DIR, 'state') : './state';
const DB_PATH = path.join(STATE_DIR, 'usage.db');

// Pricing constants (per unit)
const PRICING = {
  whisper: 0.006, // $0.006 per minute
} as const;

export interface UsageEntry {
  timestamp: string;
  provider: string;
  service: string;
  model: string;
  inputUnits: number;
  estimatedCost: number;
  status: 'success' | 'error';
  metadata?: string;
}

export interface UsageSummary {
  totalCost: number;
  totalRequests: number;
  byService: Record<string, { cost: number; requests: number }>;
  entries: UsageEntry[];
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // Ensure state directory exists
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);

    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        provider TEXT NOT NULL,
        service TEXT NOT NULL,
        model TEXT NOT NULL,
        input_units REAL NOT NULL,
        estimated_cost REAL NOT NULL,
        status TEXT NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_service ON usage(service);
    `);
  }
  return db;
}

/**
 * Log a usage entry.
 */
export function logUsage(entry: UsageEntry): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO usage (timestamp, provider, service, model, input_units, estimated_cost, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    entry.timestamp,
    entry.provider,
    entry.service,
    entry.model,
    entry.inputUnits,
    entry.estimatedCost,
    entry.status,
    entry.metadata || null
  );
}

/**
 * Estimate Whisper API cost based on audio duration in seconds.
 */
export function estimateWhisperCost(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  return Math.round(minutes * PRICING.whisper * 10000) / 10000; // Round to 4 decimals
}

/**
 * Get usage summary for today.
 */
export function getUsageToday(): UsageSummary {
  const today = new Date().toISOString().split('T')[0];
  return getUsageSince(`${today}T00:00:00.000Z`);
}

/**
 * Get usage summary for this month.
 */
export function getUsageThisMonth(): UsageSummary {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return getUsageSince(firstOfMonth.toISOString());
}

/**
 * Get usage summary since a specific date.
 */
export function getUsageSince(since: string): UsageSummary {
  const db = getDb();

  const entries = db.prepare(`
    SELECT timestamp, provider, service, model, input_units as inputUnits,
           estimated_cost as estimatedCost, status, metadata
    FROM usage
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
  `).all(since) as UsageEntry[];

  const byService: Record<string, { cost: number; requests: number }> = {};
  let totalCost = 0;
  let totalRequests = 0;

  for (const entry of entries) {
    totalCost += entry.estimatedCost;
    totalRequests++;

    if (!byService[entry.service]) {
      byService[entry.service] = { cost: 0, requests: 0 };
    }
    byService[entry.service].cost += entry.estimatedCost;
    byService[entry.service].requests++;
  }

  return {
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalRequests,
    byService,
    entries,
  };
}

/**
 * Get raw entries with pagination.
 */
export function getUsageEntries(limit = 100, offset = 0): UsageEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT timestamp, provider, service, model, input_units as inputUnits,
           estimated_cost as estimatedCost, status, metadata
    FROM usage
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as UsageEntry[];
}
