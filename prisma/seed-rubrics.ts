import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rubrics = [
  { name: "DETAILED CLASSROOM OBSERVATION", description: "Observasi detail untuk kegiatan belajar mengajar di kelas" },
  { name: "CHECKLIST FOR DIRECT INSTRUCTION", description: "Checklist untuk instruksi langsung dalam pembelajaran" },
  { name: "Special Education Teacher Supervision Instrument", description: "Instrumen supervisi untuk guru pendidikan khusus" },
  { name: "CHECKLIST FOR LEARNING AND UNDERSTANDING", description: "Checklist untuk pembelajaran dan pemahaman siswa" },
  { name: "FOCUS ON LEARNERS – STUDENT ENGAGEMENT", description: "Fokus pada keterlibatan siswa dalam pembelajaran" },
  { name: "CHECKLIST FOR DIFFERENTIATION", description: "Checklist untuk diferensiasi pembelajaran" },
  { name: "FOCUS ON LEARNERS – SMALL GROUP OR IN PAIRING", description: "Fokus pada pembelajaran kelompok kecil atau berpasangan" },
  { name: "CLASSROOM DISPLAY CHECKLIST", description: "Checklist untuk display/penataan ruang kelas" },
  { name: "Test Observation", description: "Observasi untuk testing" },
  { name: "Lesson Preparation Walkthrough", description: "Walkthrough persiapan pembelajaran" },
  { name: "DELIVERY OF INSTRUCTION", description: "Observasi penyampaian instruksi pembelajaran" },
  { name: "obstest", description: "Rubric untuk testing observasi" },
  { name: "obsertvertest", description: "Rubric untuk testing observasi (alternatif)" },
];

async function main() {
  console.log("🚀 Mulai seeding rubrics...\n");
  let successCount = 0;
  let skipCount = 0;

  for (const rubric of rubrics) {
    try {
      const existing = await prisma.rubricTemplate.findFirst({
        where: { name: rubric.name },
      });

      if (existing) {
        await prisma.rubricTemplate.update({
          where: { id: existing.id },
          data: { description: rubric.description },
        });
        console.log(`🔄 Updated: ${rubric.name}`);
      } else {
        await prisma.rubricTemplate.create({
          data: {
            name: rubric.name,
            description: rubric.description,
            isGlobal: true,
          },
        });
        console.log(`✅ Created: ${rubric.name}`);
      }
      successCount++;
    } catch (err: any) {
      console.error(`❌ Gagal: ${rubric.name}:`, err.message);
      skipCount++;
    }
  }

  const total = await prisma.rubricTemplate.count();
  console.log(`\n🎉 Seeding rubrics selesai!`);
  console.log(`   ✅ Berhasil : ${successCount} rubric`);
  console.log(`   ⚠️  Skip    : ${skipCount} rubric`);
  console.log(`   Total rubrics di database: ${total}`);
}

main()
  .catch((e) => { console.error("💥 Fatal error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());