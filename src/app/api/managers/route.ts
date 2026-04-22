// src/app/api/managers/route.ts
// Endpoint untuk admin: ambil daftar user yang punya role manager
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

export async function GET() {
  const { user, response } = await requireRole("admin");
  if (response) return response;

  try {
    const managers = await prisma.user.findMany({
      where: {
        status: "active",
        roles: {
          some: {
            role: { in: ["manager", "admin"] },
          },
        },
      },
      select: {
        id: true,
        email: true,
        profile: { select: { fullName: true } },
      },
      orderBy: { email: "asc" },
    });

    return NextResponse.json(managers);
  } catch (error: any) {
    console.error("GET /api/managers error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
