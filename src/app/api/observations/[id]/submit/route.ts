// src/app/api/observations/[id]/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { notifyObservationSubmitted } from "@/lib/notifications/observation-notifications";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireRole("manager", "admin");
    if (response) return response;

    const { id } = await params;
    const isAdmin = user!.roles.includes("admin");

    const observation = await prisma.observation.findUnique({
      where: { id },
      include: {
        answers: true,
        staff:   { include: { profile: true } },
        manager: { include: { profile: true } },
        rubric:  true,
      },
    });

    if (!observation) {
      return NextResponse.json({ error: "Observation tidak ditemukan." }, { status: 404 });
    }

    if (!isAdmin && observation.managerId !== user!.id) {
      return NextResponse.json(
        { error: "Forbidden. Anda hanya bisa submit observasi yang ditugaskan kepada Anda." },
        { status: 403 }
      );
    }

    if (observation.status !== "draft") {
      return NextResponse.json(
        { error: "Hanya observation berstatus draft yang bisa disubmit." },
        { status: 400 }
      );
    }

    const filledAnswers = observation.answers.filter((a) => a.score > 0);
    if (filledAnswers.length === 0) {
      return NextResponse.json(
        { error: "Isi minimal satu indikator sebelum submit." },
        { status: 400 }
      );
    }

    const updated = await prisma.observation.update({
      where: { id },
      data: { status: "submitted", submittedAt: new Date() },
      include: {
        staff:   { include: { profile: true } },
        manager: { include: { profile: true } },
        rubric:  true,
      },
    });

    await prisma.observationUpdate.create({
      data: {
        observationId: id,
        updatedById:   user!.id,
        statusFrom:    "draft",
        statusTo:      "submitted",
        notes:         `Submitted oleh ${isAdmin ? "admin" : "manager"}`,
      },
    // ✅ type annotation
    }).catch((err: unknown) => console.error("ObservationUpdate error:", err));

    await notifyObservationSubmitted(
      updated.staff.email,
      updated.staff.profile?.fullName || updated.staff.email,
      updated.rubric?.name || "Observation",
      updated.id
    // ✅ type annotation
    ).catch((err: unknown) => console.error("Email submit error:", err));

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("PATCH /api/observations/[id]/submit error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
