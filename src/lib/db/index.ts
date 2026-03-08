import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "fs";
import path from "path";
import { applyMigrations } from "./apply-migrations";

let _db: ReturnType<typeof createDb> | null = null;
let _dbReady = false;

function resolveDatabasePath() {
  return process.env.DB_PATH || path.join(process.cwd(), "data", "arrmate.db");
}

function ensureParentDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createDb() {
  const dbPath = resolveDatabasePath();
  ensureParentDirectory(dbPath);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }

  if (!_dbReady) {
    applyMigrations(_db);
    _dbReady = true;
  }

  return _db;
}

export function getDatabasePath() {
  return resolveDatabasePath();
}

export type AppDatabase = ReturnType<typeof getDb>;
