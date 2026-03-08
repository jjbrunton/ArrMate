import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeTempDbPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "arrmate-db-")), "arrmate.db");
}

function writeLegacySchema(dbPath: string) {
  const sqlite = new Database(dbPath);
  const migrationFiles = [
    "0000_powerful_blob.sql",
    "0001_previous_spitfire.sql",
    "0002_odd_timeslip.sql",
    "0003_typical_lucky_pierre.sql",
    "0004_rainy_lightspeed.sql",
    "0005_modern_mimic.sql",
    "0006_sharp_iron_fist.sql",
    "0007_late_maginty.sql",
    "0008_dear_shen.sql",
  ];

  for (const fileName of migrationFiles) {
    const sql = fs.readFileSync(path.join(process.cwd(), "drizzle", fileName), "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    );
    sqlite.exec(sql);
  }

  sqlite.exec(`
    CREATE TABLE "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );

    INSERT INTO "__drizzle_migrations" ("hash", "created_at")
    VALUES ('legacy-auth-sessions', 1772999916991);
  `);
  sqlite.close();
}

describe("db bootstrap", () => {
  const originalDbPath = process.env.DB_PATH;

  afterEach(() => {
    vi.resetModules();

    if (originalDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalDbPath;
    }
  });

  it("applies migrations before returning a fresh database connection", async () => {
    process.env.DB_PATH = makeTempDbPath();

    const [{ getDb }, schema] = await Promise.all([import("./index"), import("./schema")]);
    const db = getDb();

    expect(db.select().from(schema.authAdmin).all()).toEqual([]);
    expect(db.select().from(schema.authSessions).all()).toEqual([]);
  });

  it("applies pending migrations for databases created before auth_admin existed", async () => {
    const dbPath = makeTempDbPath();
    writeLegacySchema(dbPath);
    process.env.DB_PATH = dbPath;

    const [{ getDb }, schema] = await Promise.all([import("./index"), import("./schema")]);
    const db = getDb();

    expect(db.select().from(schema.authAdmin).all()).toEqual([]);
    expect(db.select().from(schema.importedRequests).all()).toEqual([]);
  });
});
