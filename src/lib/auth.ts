// src/lib/auth.ts

import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

// ─── Type augmentation (Next Auth v5 style) ───────────────────────────────────
// Di v5, augment "next-auth" saja — TIDAK ada "next-auth/jwt" sebagai modul terpisah

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string | null;
    roles: string[];
    departmentId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      roles: string[];
      departmentId?: string | null;
    };
  }
}

// ─── Auth Config ───────────────────────────────────────────────────────────────

export const authConfig = {
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z
          .object({
            email:    z.string().email(),
            password: z.string().min(1),
          })
          .safeParse(credentials);

        if (!parsed.success) {
          console.log("[auth] Invalid credentials format");
          return null;
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            roles:   true,  // UserRole[] — field 'role' adalah enum app_role
            profile: true,  // Profile?  — berisi fullName dan departmentId
          },
        });

        if (!user) {
          console.log(`[auth] User not found: ${email}`);
          return null;
        }

        // ✅ Prisma schema: passwordHash @map("password_hash"), bukan 'password'
        if (!user.passwordHash) {
          console.log(`[auth] No password hash: ${email}`);
          return null;
        }

        // Tolak akun dengan password sementara dari migration/import script
        if (
          user.passwordHash === "temporary_hash_change_me" ||
          user.passwordHash === "hashedpassword"
        ) {
          console.log(`[auth] Temporary password rejected: ${email}`);
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          console.log(`[auth] Wrong password: ${email}`);
          return null;
        }

        if (user.status !== "active") {
          console.log(`[auth] Account not active (${user.status}): ${email}`);
          return null;
        }

        // ✅ user.roles[].role adalah enum app_role, cast ke string[]
        const roleNames = user.roles.map((r) => r.role as string);

        console.log(`[auth] ✅ Login: ${email} | roles: ${roleNames.join(", ")}`);

        return {
          id:           user.id,
          email:        user.email,
          name:         user.profile?.fullName    ?? null,
          roles:        roleNames,
          departmentId: user.profile?.departmentId ?? null,
        };
      },
    }),
  ],

  callbacks: {
    // token bertipe 'any' di v5 untuk menghindari konflik — simpan data custom di sini
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id           = user.id;
        token.roles        = user.roles        ?? [];
        token.departmentId = user.departmentId ?? null;
      }
      return token;
    },

    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id           = token.id;
        session.user.roles        = token.roles        ?? [];
        session.user.departmentId = token.departmentId ?? null;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth",
    error:  "/auth",
  },

  session: { strategy: "jwt" },

  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

// ✅ Export authOptions sebagai alias (backward compat)
export const authOptions = authConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
