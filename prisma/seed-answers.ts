import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Membuat answers untuk observations yang belum punya answers...\n");

  const observations = await prisma.observation.findMany({
    include: {
      rubric: { include: { sections: { include: { indicators: true } } } },
      answers: true,
    },
  });

  let fixed = 0;
  for (const obs of observations) {
    const allIndicatorIds = obs.rubric.sections.flatMap(s => s.indicators.map(i => i.id));
    const existingIds = new Set(obs.answers.map(a => a.indicatorId));
    const missing = allIndicatorIds.filter(id => !existingIds.has(id));

    if (missing.length > 0) {
      await prisma.observationAnswer.createMany({
        data: missing.map(indicatorId => ({
          observationId: obs.id,
          indicatorId,
          score: 0,
          note: "",
        })),
        skipDuplicates: true,
      });
      console.log(`✅ Obs ${obs.id}: +${missing.length} answers`);
      fixed++;
    }
  }

  console.log(`\n🎉 Selesai! ${fixed} observation diperbaiki.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());