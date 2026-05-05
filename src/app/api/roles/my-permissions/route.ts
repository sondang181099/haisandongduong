import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Role } from "@/models/Role";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/roles/my-permissions
 * Trả về danh sách menu permissions của người dùng hiện tại
 * dựa theo role key trong session.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any)?.role;

    // Admin tối cao → có tất cả quyền, không cần tra DB
    if (userRole === "admin") {
      return NextResponse.json({ permissions: ["*"], isAdmin: true });
    }

    await connectDB();
    const roleData = await Role.findOne({ key: userRole });

    if (!roleData) {
      return NextResponse.json({ permissions: [] });
    }

    return NextResponse.json({
      permissions: roleData.permissions || [],
      viewUnpaid: roleData.viewUnpaid,
      viewPaid: roleData.viewPaid,
      viewRevenueOverview: roleData.viewRevenueOverview,
      canDeleteLocal: roleData.canDeleteLocal,
      isDriverRole: roleData.isDriverRole,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
