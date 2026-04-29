// src/app/api/observations/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth-helpers";
import { notifyObservationCreated } from "@/lib/notifications/observation-notifications";

export async function GET(req: Request) {
  const { user, response } = await requireAuth();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const isAdmin    = user!.roles.includes("admin");
  const isDirector = user!.roles.includes("director");
  const isManager  = user!.roles.includes("manager");

  const roleFilter =
    isAdmin || isDirector
      ? {}
      : isManager
      ? { managerId: user!.id }
      : { staffId: user!.id };

  try {
    const observations = await prisma.observation.findMany({
      where: {
        ...roleFilter,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        staff: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        manager: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        rubric:  { select: { id: true, name: true } },
        answers: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(observations);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("GET /api/observations error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { user, response } = await requireRole("admin");
  if (response) return response;

  try {
    const body = await req.json().catch(() => ({}));

    const staffId   = body.staffId?.trim();
    const rubricId  = body.rubricId?.trim();
    const managerId = body.managerId?.trim() || user!.id;

    if (!staffId || !rubricId) {
      return NextResponse.json(
        { error: "staffId dan rubricId wajib diisi." },
        { status: 400 }
      );
    }

    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      include: { profile: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff tidak ditemukan." }, { status: 404 });
    }

    if (managerId !== user!.id) {
      const managerUser = await prisma.user.findUnique({
        where: { id: managerId },
        include: { roles: true },
      });
      if (!managerUser) {
        return NextResponse.json({ error: "Manager tidak ditemukan." }, { status: 404 });
      }
      const mRoles = managerUser.roles.map((r) => r.role as string);
      if (!mRoles.includes("manager") && !mRoles.includes("admin")) {
        return NextResponse.json(
          { error: "User yang dipilih sebagai manager tidak memiliki role manager." },
          { status: 400 }
        );
      }
    }

    const rubric = await prisma.rubricTemplate.findUnique({
      where: { id: rubricId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { indicators: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!rubric) {
      return NextResponse.json({ error: "Rubric tidak ditemukan." }, { status: 404 });
    }

    const observation = await prisma.$transaction(async (tx) => {
      const obs = await tx.observation.create({
        data: {
          staffId,
          managerId,
          rubricId,
          status: "draft",
          type:   "MANAGER",
          title:  `Observasi - ${staff.profile?.fullName || staff.email}`,
          description: "",
        },
      });

      const answerRows = rubric.sections.flatMap((section) =>
        section.indicators.map((indicator) => ({
          observationId: obs.id,
          indicatorId:   indicator.id,
          score:         0,
          note:          "",
        }))
      );

      if (answerRows.length > 0) {
        await tx.observationAnswer.createMany({
          data: answerRows,
          skipDuplicates: true,
        });
      }

      return obs;
    });

    const assignedManager = await prisma.user.findUnique({
      where: { id: managerId },
      include: { profile: true },
    });
    if (assignedManager) {
      await notifyObservationCreated(
        assignedManager.email,
        staff.profile?.fullName || staff.email,
        rubric.name,
        observation.id
      // ✅ type annotation
      ).catch((err: unknown) => console.error("Email create error:", err));
    }

    return NextResponse.json(observation, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /api/observations error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
