import path from "path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { createLogger } from "../utils/logger";

const log = createLogger("migrate");

function resolveMigrationsFolder() {
  return path.join(process.cwd(), "drizzle");
}

export function applyMigrations(db: BetterSQLite3Database<typeof schema>) {
  try {
    migrate(db, { migrationsFolder: resolveMigrationsFolder() });
    log.info("Database migrations completed successfully");
  } catch (err) {
    log.error({ err }, "Failed to run database migrations");
    throw err;
  }
}
