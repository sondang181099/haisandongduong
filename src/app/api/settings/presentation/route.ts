import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SystemSetting } from "@/models/SystemSetting";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const SETTING_KEY = "presentation_auto_update";

export async function GET() {
  try {
    // Presentation screen might not be authenticated, but let's check session if possible
    // Actually, presentation screen is usually a public or semi-public view
    // For now, let's allow GET without strict auth if needed, or check if it's the admin
    
    await connectDB();
    const setting = await SystemSetting.findOne({ key: SETTING_KEY });
    
    return NextResponse.json({ autoUpdate: setting ? !!setting.value : true });
  } catch (error) {
    console.error("GET /api/settings/presentation error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { autoUpdate } = await request.json();

    await connectDB();
    
    await SystemSetting.findOneAndUpdate(
      { key: SETTING_KEY },
      { 
        value: !!autoUpdate,
        description: "Cấu hình tự động cập nhật cho màn hình trình chiếu" 
      },
      { upsert: true }
    );

    return NextResponse.json({ autoUpdate });
  } catch (error) {
    console.error("POST /api/settings/presentation error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
