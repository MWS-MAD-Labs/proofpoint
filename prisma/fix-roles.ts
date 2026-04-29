import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
 
const prisma = new PrismaClient();
 
function parseRole(roleStr: string): string {
  const clean = roleStr?.trim().toLowerCase();
  if (clean === "manager") return "manager";
  if (clean === "director") return "director";
  if (clean === "admin") return "admin";
  return "staff";
}
 
async function main() {
  console.log("🔧 Fix-roles script dimulai...\n");
 
  // Baca CSV
  const csvFilePath = path.resolve("./prisma/users.csv");
  const fileContent = fs.readFileSync(csvFilePath, "utf-8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });
 
  let fixed = 0;
  let notFound = 0;
 
  for (const record of records) {
    const email = record.email?.trim();
    const roleValue = parseRole(record.role);
 
    if (!email) continue;
 
    // Cari user di database
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
 
    if (!user) {
      console.log(`⚠️  User tidak ditemukan di DB: ${email}`);
      notFound++;
      continue;
    }
 
    // Cek apakah role sudah benar
    const existingRoles = user.roles.map((r: any) => r.role);
    const hasCorrectRole = existingRoles.includes(roleValue);
 
    if (!hasCorrectRole) {
      // Tambahkan role yang benar
      await prisma.userRole.upsert({
        where: {
          userId_role: {
            userId: user.id,
            role: roleValue as any,
          },
        },
        update: {},
        create: {
          userId: user.id,
          role: roleValue as any,
        },
      });
      console.log(`✅ Fix role ${email}: [] → [${roleValue}]`);
    } else {
      console.log(`✓  ${email}: sudah punya role [${existingRoles.join(", ")}]`);
    }
 
    // Pastikan semua user punya minimal role "staff"
    const hasStaff = existingRoles.includes("staff") || roleValue === "staff";
    if (!hasStaff) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: "staff" as any } },
        update: {},
        create: { userId: user.id, role: "staff" as any },
      });
    }
 
    fixed++;
  }
 
  console.log(`\n🎉 Fix selesai!`);
  console.log(`   ✅ Diproses : ${fixed}`);
  console.log(`   ⚠️  Tidak ada di DB : ${notFound}`);
 
  // Verifikasi
  console.log("\n📊 Role summary setelah fix:");
  const roleCounts = await prisma.userRole.groupBy({
    by: ["role"],
    _count: { role: true },
  });
  for (const r of roleCounts) {
    console.log(`   ${r.role}: ${r._count.role} user`);
  }
 
  // Cek khusus user yang seharusnya manager
  console.log("\n👔 User dengan role manager:");
  const managers = await prisma.userRole.findMany({
    where: { role: "manager" as any },
    include: { user: { select: { email: true } } },
  });
  for (const m of managers) {
    console.log(`   - ${m.user.email}`);
  }
}
 
main()
  .catch((e) => {
    console.error("💥 Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
 