import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Revenue } from "@/models/Revenue";
import { VehicleProfitConfig } from "@/models/VehicleProfitConfig";
import { calculateProfit } from "@/lib/commission";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emitRevenueUpdate } from "@/lib/socket-server";
import { SystemSetting } from "@/models/SystemSetting";
import { getReducedRevenue, DEFAULT_REDUCTION_RULES } from "@/lib/reduction";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

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

    let transaction;
    if (id.startsWith("virtual_")) {
      const parts = id.replace("virtual_", "").split("_");
      const code = parts[0];
      const dateKey = parts[1];
      const invoiceCode = parts[2] || undefined;
      
      const { Customer } = await import("@/models/Customer");
      const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const dbCustomer = await Customer.findOne({
        code: { $regex: `^${escapedCode}$`, $options: "i" }
      }).sort({ createdAt: -1 });
      
      const startOfDay = dayjs.tz(dateKey, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfDay = dayjs.tz(dateKey, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      
      const { Invoice } = await import("@/models/Invoice");
      const invoices = await Invoice.find({
        customerCode: code,
        createdDate: { $gte: startOfDay, $lte: endOfDay },
        status: 1
      });
      const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const invoicePlate = invoices.length > 0 ? (invoices[0].customerName || dbCustomer?.licensePlate) : dbCustomer?.licensePlate;
      
      transaction = await Revenue.create({
        code: code,
        invoiceCode: invoiceCode,
        arrivalDate: startOfDay,
        customerModifiedDate: startOfDay,
        licensePlate: invoicePlate || "Chưa xác định",
        vehicleNumber: invoicePlate || "Chưa xác định",
        groups: dbCustomer?.groups || "Khách lẻ.",
        revenue: totalRevenue,
        profit: 0,
        status: 0,
        paymentMethod: 0,
        customerId: dbCustomer?.customerId
      });
    } else {
      transaction = await Revenue.findById(id);
    }

    if (!transaction) {
      return NextResponse.json({ error: "Giao dịch không tồn tại" }, { status: 404 });
    }

    // 1. Fetch configurations for recalculation
    const configs = await VehicleProfitConfig.find({}).lean();
    
    // 2. Fetch reduction rules
    const reductionSetting = await SystemSetting.findOne({ key: "revenue_reduction_rules" }).lean();
    const reductionRules = reductionSetting?.value || DEFAULT_REDUCTION_RULES;
    
    const baseRevenue = transaction.isFrozen ? (transaction.frozenRevenue ?? transaction.revenue) : (transaction.revenue || 0);
    const reducedRevenue = getReducedRevenue(baseRevenue, transaction.groups || "", reductionRules);

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
