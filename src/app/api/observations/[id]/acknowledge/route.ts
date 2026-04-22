
// ─── src/app/api/observations/[id]/acknowledge/route.ts ───────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notifyObservationAcknowledged } from "@/lib/notifications/observation-notifications";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireAuth();
    if (response) return response;

    const { id } = await params;
    const isAdmin = user!.roles.includes("admin");

    const observation = await prisma.observation.findUnique({
      where: { id },
      include: {
        staff:   { include: { profile: true } },
        manager: { include: { profile: true } },
        rubric:  true,
      },
    });

    if (!observation) {
      return NextResponse.json({ error: "Observation tidak ditemukan." }, { status: 404 });
    }

    if (observation.status !== "submitted") {
      return NextResponse.json(
        { error: "Observation harus berstatus submitted sebelum bisa di-acknowledge." },
        { status: 400 }
      );
    }

    if (!isAdmin && observation.staffId !== user!.id) {
      return NextResponse.json(
        { error: "Forbidden. Anda hanya bisa acknowledge observasi milik Anda sendiri." },
        { status: 403 }
      );
    }

    const updated = await prisma.observation.update({
      where: { id },
      data: {
        status:        "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedBy: user!.id,
      },
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
        statusFrom:    "submitted",
        statusTo:      "acknowledged",
        notes:         `Acknowledged oleh ${isAdmin ? "admin" : "staff"}`,
      },
    // ✅ type annotation — fixes "Parameter 'err' implicitly has 'any' type"
    }).catch((err: unknown) => console.error("ObservationUpdate error:", err));

    const admin = await prisma.user.findFirst({
      where: { roles: { some: { role: "admin" } } },
      include: { profile: true },
    });

    if (admin) {
      await notifyObservationAcknowledged(
        admin.email,
        updated.staff.profile?.fullName  || updated.staff.email,
        updated.manager?.profile?.fullName || updated.manager?.email || "Manager",
        updated.rubric?.name || "Observation",
        updated.id
      // ✅ type annotation
      ).catch((err: unknown) => console.error("Email acknowledge error:", err));
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("PATCH /api/observations/[id]/acknowledge error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
