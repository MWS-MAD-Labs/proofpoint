// src/lib/auth-helpers.ts

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

interface SessionUser {
  id: string;
  email: string;
  roles: string[];
  departmentId?: string | null;
  name?: string | null;
}

interface AuthResult {
  user: SessionUser | null;
  response: NextResponse | null;
}

/**
 * Periksa apakah user sudah login.
 * Return { user, response: null } jika ok.
 * Return { user: null, response: 401 } jika belum login.
 */
export async function requireAuth(): Promise<AuthResult> {
  // ✅ auth() adalah pengganti getServerSession di Next Auth v5
  const session = await auth();

  if (!session?.user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Unauthorized. Silakan login terlebih dahulu." },
        { status: 401 }
      ),
    };
  }

  return { user: session.user as SessionUser, response: null };
}

/**
 * Periksa login + kepemilikan role.
 *
 * Contoh:
 *   requireRole("admin")             → hanya admin
 *   requireRole("manager", "admin")  → manager ATAU admin
 *   requireRole("staff", "admin")    → staff ATAU admin
 *
 * ✅ Admin selalu lolos semua requireRole secara otomatis.
 */
export async function requireRole(...roles: string[]): Promise<AuthResult> {
  const { user, response } = await requireAuth();
  if (response) return { user: null, response };

  const userRoles: string[] = user!.roles ?? [];
  const isAdmin  = userRoles.includes("admin");
  const hasRole  = isAdmin || roles.some((r) => userRoles.includes(r));

  if (!hasRole) {
    return {
      user: null,
      response: NextResponse.json(
        { error: `Forbidden. Akses memerlukan salah satu role: ${roles.join(", ")}.` },
        { status: 403 }
      ),
    };
  }

  return { user: user!, response: null };
}
