import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const isLoggedIn = !!token;
  const isOnAdminPage = req.nextUrl.pathname.startsWith("/admin");
  const isOnLoginPage = req.nextUrl.pathname === "/login";

  if (isOnAdminPage && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isOnLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/admin/revenue", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
