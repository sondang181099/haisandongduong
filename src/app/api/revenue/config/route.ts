import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { VehicleProfitConfig } from "@/models/VehicleProfitConfig";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const configs = await VehicleProfitConfig.find({}).sort({ name: 1 });
    return NextResponse.json(configs);
  } catch (error) {
    console.error("GET /api/revenue/config error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, config, rounding } = body;

    if (!name) {
      return NextResponse.json({ error: "Vehicle name is required" }, { status: 400 });
    }

    await connectDB();
    
    // Log để kiểm tra model đang dùng bản ghi nào
    console.log("Model collection name:", VehicleProfitConfig.collection.name);
    console.log("Saving nested config and rounding for name:", name);

    const dbConfig = await VehicleProfitConfig.findOneAndUpdate(
      { name },
      { 
        $set: { config, rounding, name },
        $unset: { formula: "", conditions: "", roundingStep: "" } 
      },
      { upsert: true, returnDocument: 'after', strict: false }
    );

    console.log("Saved document result:", !!dbConfig);

    return NextResponse.json(dbConfig);
  } catch (error) {
    console.error("POST /api/revenue/config error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
