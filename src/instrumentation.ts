export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/db/migrate");
    const { bootstrapEncryptionKey } = await import("./lib/crypto");
    const { startScheduler } = await import("./lib/scheduler");

    runMigrations();
    bootstrapEncryptionKey();
    startScheduler();
  }
}
