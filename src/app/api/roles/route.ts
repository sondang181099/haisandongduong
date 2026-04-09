import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Role } from "@/models/Role";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const currentUserRole = (session?.user as any)?.role;

    await connectDB();
    
    // Nếu không phải là root, thì không được thấy vai trò root trong danh sách
    const query = currentUserRole === "root" ? {} : { key: { $ne: "root" } };

    const roles = await Role.find(query).sort({ createdAt: 1 });
    return NextResponse.json({ roles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { _id, ...roleData } = body;

    await connectDB();

    if (_id) {
      const updated = await Role.findByIdAndUpdate(_id, roleData, { new: true });
      return NextResponse.json({ role: updated });
    } else {
      const created = await Role.create(roleData);
      return NextResponse.json({ role: created });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    await connectDB();
    const role = await Role.findById(id);
    if (role?.isSystem) {
      return NextResponse.json({ error: "Không thể xóa quyền hệ thống" }, { status: 400 });
    }

    await Role.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
