import "dotenv/config"
import path from "node:path"
import { defineConfig } from "prisma/config"

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined")
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),

  datasource: {
    url: databaseUrl,
  },

  migrate: {
    async adapter() {
      const { PrismaPg } = await import("@prisma/adapter-pg")

      return new PrismaPg({
        connectionString: databaseUrl,
      })
    },
  },
})