// Prisma config — reads DATABASE_URL from environment (injected by docker-compose or .env locally)
import { defineConfig } from "prisma/config";

// Load .env only in non-production environments (local dev)
if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
