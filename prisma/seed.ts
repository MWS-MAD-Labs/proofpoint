import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Mulai seeding rubrics...\n");

  const rubrics = [
    { name: "DETAILED CLASSROOM OBSERVATION", description: "Observasi detail untuk kegiatan belajar mengajar di kelas", category: "classroom" },
    { name: "CHECKLIST FOR DIRECT INSTRUCTION", description: "Checklist untuk instruksi langsung dalam pembelajaran", category: "instruction" },
    { name: "Special Education Teacher Supervision Instrument", description: "Instrumen supervisi untuk guru pendidikan khusus", category: "special_education" },
    { name: "CHECKLIST FOR LEARNING AND UNDERSTANDING", description: "Checklist untuk pembelajaran dan pemahaman siswa", category: "learning" },
    { name: "FOCUS ON LEARNERS – STUDENT ENGAGEMENT", description: "Fokus pada keterlibatan siswa dalam pembelajaran", category: "engagement" },
    { name: "CHECKLIST FOR DIFFERENTIATION", description: "Checklist untuk diferensiasi pembelajaran", category: "differentiation" },
    { name: "FOCUS ON LEARNERS – SMALL GROUP OR IN PAIRING", description: "Fokus pada pembelajaran kelompok kecil atau berpasangan", category: "group_learning" },
    { name: "CLASSROOM DISPLAY CHECKLIST", description: "Checklist untuk display/penataan ruang kelas", category: "environment" },
    { name: "Test Observation", description: "Observasi untuk testing", category: "test" },
    { name: "Lesson Preparation Walkthrough", description: "Walkthrough persiapan pembelajaran", category: "preparation" },
    { name: "DELIVERY OF INSTRUCTION", description: "Observasi penyampaian instruksi pembelajaran", category: "instruction" },
    { name: "obstest", description: "Rubric untuk testing observasi", category: "test" },
    { name: "obsertvertest", description: "Rubric untuk testing observasi (alternatif)", category: "test" },
  ];

  let successCount = 0;
  let existingCount = 0;

  for (const rubric of rubrics) {
    try {
      // Cek apakah rubric sudah ada
      const existing = await prisma.rubricTemplate.findFirst({
        where: { name: rubric.name }
      });
      
      if (!existing) {
        await prisma.rubricTemplate.create({
          data: rubric
        });
        console.log(`✅ Created: ${rubric.name}`);
        successCount++;
      } else {
        console.log(`⏭️  Already exists: ${rubric.name}`);
        existingCount++;
      }
    } catch (err: any) {
      console.error(`❌ Failed: ${rubric.name} - ${err.message}`);
    }
  }

  console.log(`\n🎉 Seeding rubrics selesai!`);
  console.log(`   ✅ Berhasil membuat: ${successCount} rubric`);
  console.log(`   ⏭️  Sudah ada: ${existingCount} rubric`);

  const total = await prisma.rubricTemplate.count();
  console.log(`\n📊 Total rubrics di database: ${total}`);
}

main()
  .catch((e) => {
    console.error("💥 Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());