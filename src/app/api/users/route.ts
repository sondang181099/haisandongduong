import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    
    // 1. Lấy tất cả người dùng, sắp xếp theo lần đăng nhập cuối cùng (gần nhất lên đầu)
    // Sử dụng aggregation để lấy giá trị lớn nhất giữa lastLoginAt và lastLogin (nếu có)
    const rawUsers = await User.aggregate([
      {
        $addFields: {
          effectiveLoginAt: { 
            $cond: {
              if: { $and: [{ $gt: ["$lastLogin", "$lastLoginAt"] }, { $ne: ["$lastLogin", null] }] },
              then: "$lastLogin",
              else: { $ifNull: ["$lastLoginAt", "$createdAt"] }
            }
          }
        }
      },
      { $sort: { effectiveLoginAt: -1 } },
      { $project: { password: 0 } }
    ]);
    
    // 3. Ghép dữ liệu trong bộ nhớ
    const users = rawUsers.map((user: any) => {
      // Chuẩn hóa tên hiển thị triệt để từ DB (hỗ trợ nhiều biến thể và fallback về username)
      const normalizedFullname = (user.fullname || user.fullName || user.Fullname || user.Name || user.displayName || user.username || "").toString().trim();
      
      // Chuẩn hóa lần đăng nhập cuối để hiển thị
      const normalizedLastLogin = user.effectiveLoginAt || user.lastLoginAt || user.lastLogin || null;

      return {
        ...user,
        fullname: normalizedFullname, // Đảm bảo luôn có fullname cho frontend
        lastLoginAt: normalizedLastLogin, // Chuẩn hóa trường ngày đăng nhập
        detectedCars: [] // Loại bỏ logic tự động nhận diện từ transactions để tăng hiệu năng
      };
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      username, 
      password, 
      fullname, 
      role, 
      identity, 
      allowedGroups,
      cars, 
      bankName, 
      bankAccount, 
      bankAccountHolder,
      bankBin 
    } = body;

    if (!username || !password || !fullname) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }

    await connectDB();

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return NextResponse.json({ error: "Tên đăng nhập đã tồn tại" }, { status: 409 });
    }

    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username,
      password: hashedPassword,
      fullname,
      role: role || "Tài xế",
      identity,
      allowedGroups: allowedGroups || [],
      cars: (cars || []).map((c: any) => typeof c === "string" ? { licensePlate: c } : c),
      payment: {
        bankBin: bankBin || "",
        bankShortName: bankName || "",
        accountNumber: bankAccount || "",
        accountName: bankAccountHolder || "",
      }
    });

    const userObj = newUser.toObject();
    const { password: _, ...userWithoutPassword } = userObj;

    return NextResponse.json({ user: userWithoutPassword }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
