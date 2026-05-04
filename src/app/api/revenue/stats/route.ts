import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/models/Transaction";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get("year");
    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear();

    await connectDB();

    // Lấy dữ liệu doanh thu nhóm theo tháng
    const stats = await Transaction.aggregate([
      {
        $match: {
          customerModifiedDate: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$customerModifiedDate" },
          revenue: { $sum: { $toDouble: { $ifNull: ["$revenue", 0] } } },
        },
      },
      {
        $sort: { "_id": 1 },
      },
    ]);

    // Chuẩn bị dữ liệu cho 12 tháng (đảm bảo tháng nào không có dữ liệu vẫn hiện 0)
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: `Thg ${i + 1}`,
      revenue: 0,
    }));

    stats.forEach((item) => {
      if (item._id >= 1 && item._id <= 12) {
        monthlyData[item._id - 1].revenue = Math.round(item.revenue / 1000000); // Chuyển sang đơn vị triệu VNĐ
      }
    });

    return NextResponse.json(monthlyData);
  } catch (error) {
    console.error("GET /api/revenue/stats error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
