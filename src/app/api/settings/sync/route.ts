import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SystemSetting } from "@/models/SystemSetting";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const setting = await SystemSetting.findOne({ key: "sync_interval_seconds" });
    
    return NextResponse.json({ 
      interval: setting ? setting.value : 10 // Mặc định 10 giây nếu chưa có
    });
  } catch (error) {
    console.error("GET sync setting error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { interval } = await request.json();
    if (typeof interval !== "number" || interval < 10) {
      return NextResponse.json({ error: "Khoảng thời gian tối thiểu là 10 giây" }, { status: 400 });
    }

    await connectDB();
    await SystemSetting.findOneAndUpdate(
      { key: "sync_interval_seconds" },
      { value: interval, description: "Khoảng thời gian đồng bộ KiotViet (giây)" },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, interval });
  } catch (error) {
    console.error("POST sync setting error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
