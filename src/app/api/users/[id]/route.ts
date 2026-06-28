import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const { 
      password, 
      fullname, 
      role, 
      identity, 
      allowedGroups,
      cars, 
      bankName, 
      bankAccount, 
      bankAccountHolder,
      bankBin,
      ...rest 
    } = body;

    await connectDB();

    const existingUser = await User.findById(id);
    if (!existingUser) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

    const updateData: any = { ...rest };
    if (fullname) updateData.fullname = fullname;
    if (role) updateData.role = role;
    if (identity !== undefined) updateData.identity = identity;
    if (allowedGroups !== undefined) updateData.allowedGroups = allowedGroups;
    
    if (cars !== undefined) {
      updateData.cars = (cars || []).map((c: any) => {
        if (typeof c === "string") return { licensePlate: c, brands: [] };
        return {
          licensePlate: c.licensePlate || "",
          brands: Array.isArray(c.brands) ? c.brands : (c.brands ? [c.brands] : [])
        };
      }).filter((c: any) => c.licensePlate);
    }
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Map payment fields
    if (bankName !== undefined || bankAccount !== undefined || bankAccountHolder !== undefined || bankBin !== undefined) {
      updateData.payment = {
        bankShortName: bankName || "",
        accountNumber: bankAccount || "",
        accountName: bankAccountHolder || "",
        bankBin: bankBin || "",
      };
    }

    const updated = await User.findByIdAndUpdate(id, updateData, { new: true }).select("-password");
    if (!updated) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("PUT /api/users/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();

    const userToDelete = await User.findById(id);
    if (!userToDelete) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

    if (userToDelete.role === "admin") {
      return NextResponse.json({ error: "Không thể xóa tài khoản Admin" }, { status: 403 });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
