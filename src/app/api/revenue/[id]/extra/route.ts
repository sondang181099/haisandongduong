import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/models/Transaction";
import { VehicleProfitConfig } from "@/models/VehicleProfitConfig";
import { calculateProfit } from "@/lib/commission";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emitRevenueUpdate } from "@/lib/socket-server";
import { SystemSetting } from "@/models/SystemSetting";
import { getReducedRevenue, DEFAULT_REDUCTION_RULES } from "@/lib/reduction";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { extraRevenue } = body;

    if (extraRevenue === undefined) {
      return NextResponse.json({ error: "Missing extraRevenue" }, { status: 400 });
    }

    await connectDB();

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Giao dịch không tồn tại" }, { status: 404 });
    }

    // 1. Fetch configurations for recalculation
    const configs = await VehicleProfitConfig.find({}).lean();
    
    // 2. Fetch reduction rules
    const reductionSetting = await SystemSetting.findOne({ key: "revenue_reduction_rules" }).lean();
    const reductionRules = reductionSetting?.value || DEFAULT_REDUCTION_RULES;
    
    const reducedRevenue = getReducedRevenue(transaction.revenue || 0, transaction.groups || "", reductionRules);

    // 3. Recalculate profit based on REDUCED revenue and new extraRevenue
    const newProfit = calculateProfit(
      reducedRevenue,
      transaction.groups || "",
      configs,
      Number(extraRevenue)
    );

    // 3. Update database
    transaction.extraRevenue = Number(extraRevenue);
    transaction.profit = newProfit;
    transaction.isRevenueChanged = true;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const username = (session.user as any)?.username || (session.user as any)?.name || "Hệ thống";
    transaction.updatedBy = username;

    await transaction.save();

    // 4. Update real-time UI via Socket.IO
    emitRevenueUpdate();

    return NextResponse.json({ 
      message: "Cập nhật phát sinh thành công", 
      transaction: {
        _id: transaction._id,
        extraRevenue: transaction.extraRevenue,
        profit: transaction.profit
      } 
    });
  } catch (error) {
    console.error("PUT /api/revenue/[id]/extra error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
