import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/models/Transaction";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    // const session = await getServerSession(authOptions);
    // if (!session || (session.user as any)?.role !== "admin") {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    await connectDB();

    // Tìm tất cả các bản ghi thiếu vehicleNumber
    const transactions = await Transaction.find({ vehicleNumber: { $exists: false } });
    let count = 0;

    for (const t of transactions) {
      t.vehicleNumber = t.licensePlate || "Chưa xác định";
      await t.save();
      count++;
    }

    return NextResponse.json({ message: "Di chuyển dữ liệu thành công", count });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
