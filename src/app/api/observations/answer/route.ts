// src/app/api/observations/answer/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";

export async function POST(req: Request) {
  // Manager yang ditugaskan atau admin bisa mengisi jawaban
  const { user, response } = await requireRole("manager", "admin");
  if (response) return response;

  const isAdmin = user!.roles.includes("admin");

  const body = await req.json().catch(() => ({}));
  const { observationId, indicatorId, score, note, evidence } = body;

  if (!observationId || !indicatorId || score === undefined) {
    return NextResponse.json(
      { error: "observationId, indicatorId, dan score wajib diisi." },
      { status: 400 }
    );
  }

  // Score harus angka 0–100
  const numScore = Number(score);
  if (isNaN(numScore) || numScore < 0 || numScore > 100) {
    return NextResponse.json(
      { error: "Score harus berupa angka antara 0 dan 100." },
      { status: 400 }
    );
  }

  const observation = await prisma.observation.findUnique({
    where: { id: observationId },
  });

  if (!observation) {
    return NextResponse.json(
      { error: "Observation tidak ditemukan." },
      { status: 404 }
    );
  }

  // Manager hanya bisa edit observasi yang ditugaskan kepadanya
  if (!isAdmin && observation.managerId !== user!.id) {
    return NextResponse.json(
      {
        error:
          "Forbidden. Anda hanya bisa mengisi observasi yang ditugaskan kepada Anda.",
      },
      { status: 403 }
    );
  }

  // Jawaban hanya bisa diubah selama status masih draft
  if (observation.status !== "draft") {
    return NextResponse.json(
      { error: "Jawaban tidak bisa diubah setelah observation disubmit." },
      { status: 400 }
    );
  }

  // Validasi indicator milik rubric yang benar
  const indicator = await prisma.rubricIndicator.findFirst({
    where: {
      id: indicatorId,
      section: { templateId: observation.rubricId },
    },
  });

  if (!indicator) {
    return NextResponse.json(
      { error: "Indicator tidak valid atau tidak sesuai dengan rubric ini." },
      { status: 400 }
    );
  }

  // Upsert menggunakan unique constraint [observationId, indicatorId]
  const result = await prisma.observationAnswer.upsert({
    where: {
      observationId_indicatorId: { observationId, indicatorId },
    },
    update: {
      score: numScore,
      note: note ?? null,
      evidence: evidence ?? null,
    },
    create: {
      observationId,
      indicatorId,
      score: numScore,
      note: note ?? null,
      evidence: evidence ?? null,
    },
  });

  return NextResponse.json(result);
}
