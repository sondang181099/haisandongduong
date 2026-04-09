import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { KiotViet } from "@/models/KiotViet";
import { Transaction } from "@/models/Transaction";
import { KiotVietInvoice } from "@/models/KiotVietInvoice";
import { VehicleProfitConfig } from "@/models/VehicleProfitConfig";
import { calculateProfit } from "@/lib/commission";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const RETAILER_CODE = "haisandongduog";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    // 1. Lấy token từ database
    const kiotTokenRecord = await KiotViet.findOne({ key: "kiotviet" }).lean();
    if (!kiotTokenRecord || !kiotTokenRecord.accessToken) {
      return NextResponse.json({ error: "No KiotViet token found in database." }, { status: 400 });
    }

    const { accessToken } = kiotTokenRecord;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const body = await request.json().catch(() => ({}));
    const range = body.range || "1day"; // Mặc định là 1 ngày cho auto-sync

    let fromDate = dayjs().tz("Asia/Ho_Chi_Minh").subtract(1, "day").startOf("day").format("YYYY-MM-DDTHH:mm:ss");
    const toDate = dayjs().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DDTHH:mm:ss");

    if (range === "7days") {
      fromDate = dayjs().tz("Asia/Ho_Chi_Minh").subtract(7, "day").startOf("day").format("YYYY-MM-DDTHH:mm:ss");
    }

    const url = `https://public.kiotapi.com/invoices?pageSize=100&orderBy=createdDate&orderDirection=Desc&fromDate=${fromDate}&toDate=${toDate}&status=1`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-app/1.0",
        "Accept": "application/json"
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `KiotViet API error: ${response.status}`, details: errorText }, { status: 500 });
    }

    const json = await response.json();
    const invoices = json.data || [];

    // 3. Lấy cấu hình hoa hồng
    const profitConfigs = await VehicleProfitConfig.find({}).lean();

    // 4. Lưu dữ liệu thô và lọc các hóa đơn chưa đồng bộ
    for (const invoice of invoices) {
      await KiotVietInvoice.findOneAndUpdate(
        { invoiceCode: invoice.code },
        { rawData: invoice }, // Lưu rawData nhưng chưa đánh dấu syncedToTransaction
        { upsert: true }
      );
    }

    // Lấy danh sách các hóa đơn chưa được đẩy sang Transaction
    const unsyncedInvoices = await KiotVietInvoice.find({
      invoiceCode: { $in: invoices.map((i: any) => i.code) },
      syncedToTransaction: { $ne: true }
    }).lean();

    if (unsyncedInvoices.length === 0) {
      return NextResponse.json({ message: "No new invoices to sync", newOrUpdatedRecords: 0 });
    }

    // 5. Gom nhóm các hóa đơn theo khách hàng và ngày
    const groupsMap: Record<string, any> = {};

    for (const item of unsyncedInvoices) {
      const inv = item.rawData;
      // Chỉ lấy customerCode, nếu không có (khách vãng lai) thì mặc định là "Khách lẻ"
      const rawCode = inv.customerCode || "Khách lẻ";
      // Làm sạch mã khách hàng: Bỏ phần {DEL...} đằng sau
      const customerCode = rawCode.split("{")[0].trim();
      
      const dateKey = dayjs.tz(inv.createdDate, "Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
      const groupKey = `${customerCode}_${dateKey}`;

      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          customerCode,
          dateKey,
          invoices: [],
          totalRevenue: 0,
          totalProfit: 0,
          invoiceCodes: []
        };
      }

      // Tính hoa hồng cho từng hóa đơn
      const revenue = inv.total || 0;
      const profit = calculateProfit(revenue, inv.customerGroups || "Khách lẻ.", profitConfigs);

      groupsMap[groupKey].totalRevenue += revenue;
      groupsMap[groupKey].totalProfit += profit;
      groupsMap[groupKey].invoiceCodes.push(inv.code);
      groupsMap[groupKey].invoices.push(inv);
    }

    // 6. Cập nhật hoặc tạo mới Transaction cho từng nhóm
    let successCount = 0;
    for (const key in groupsMap) {
      const group = groupsMap[key];
      const firstInv = group.invoices[0];
      const startOfDay = dayjs.tz(group.dateKey, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfDay = dayjs.tz(group.dateKey, "Asia/Ho_Chi_Minh").endOf("day").toDate();

      // MẶC ĐỊNH: Lấy thông tin từ hóa đơn đầu tiên trong nhóm
      let licensePlate = firstInv.customerName || firstInv.description || "Khách lẻ";
      if (licensePlate.includes("{DEL}")) {
        licensePlate = licensePlate.split("{")[0].trim();
      }
      
      let customerGroups = firstInv.customerGroups || "Khách lẻ."; 
      let brands = customerGroups.split(",").map((g: string) => g.trim()).filter(Boolean);
      let customerId = firstInv.customerId || null;
      let isCustomerDeleted = firstInv.customerCode?.includes("{DEL}") || false;

      // BƯỚC A: Thử lấy thông tin chuẩn từ Profile khách hàng (Ví dụ: Xe điện 388 hoặc Nội bộ)
      if (group.customerCode !== "Khách lẻ") {
        try {
          const cleanCode = group.customerCode.split("{")[0];
          const searchParam = `code=${cleanCode}`;
          const custRes = await fetch(`https://public.kiotapi.com/customers?${searchParam}`, {
            headers: { 
              "Authorization": `Bearer ${accessToken}`, 
              "Retailer": RETAILER_CODE, 
              "User-Agent": "haisandongduong-app/1.0" 
            }
          });

          if (custRes.ok) {
            const custData = await custRes.json();
            // Ưu tiên bản ghi "đẹp" (không có {DEL} trong tên)
            const customer = custData.data?.find((c: any) => !c.name?.includes("{DEL}")) || custData.data?.[0];
            
            if (customer) {
              // Cập nhật biển số: Ưu tiên biển số thật (29K...), sau đó đến tên đẹp (Xe điện 388)
              const bestName = customer.licensePlate || (customer.name && !customer.name.includes("{DEL}") ? customer.name : null);
              if (bestName) licensePlate = bestName;
              
              if (customer.groups) {
                customerGroups = customer.groups;
                brands = customer.groups.split(",").map((g: string) => g.trim()).filter(Boolean);
              }
              customerId = customer.id || customerId;
              if (customer.name?.includes("{DEL}")) isCustomerDeleted = true;
            }
          }
        } catch (e) { console.error("Fetch customer error:", e); }
      }

      // BƯỚC B: Tính toán lại tổng doanh thu và hoa hồng
      let totalRevenue = 0;
      let totalProfit = 0; // Mặc định là 0 khi mới kéo về theo yêu cầu
      for (const inv of group.invoices) {
        totalRevenue += (inv.total || 0);
      }

      const createdDate = dayjs.tz(firstInv.createdDate, "Asia/Ho_Chi_Minh").toDate();

      // 1. Tìm bản ghi hiện có để đối soát
      // Thử tìm theo mã hóa đơn trước để phát hiện trường hợp đổi mã khách hàng (Khách lẻ -> XD...)
      const invoiceMatchQuery = {
        arrivalDate: { $gte: startOfDay, $lte: endOfDay },
        invoiceCode: { $regex: group.invoiceCodes.map((c: string) => `\\b${c}\\b`).join('|') }
      };

      const matchingQuery = {
        arrivalDate: { $gte: startOfDay, $lte: endOfDay },
        $or: [
          ...(customerId ? [{ customerId: customerId }] : []),
          { code: group.customerCode }
        ]
      };

      // Ưu tiên tìm theo mã hóa đơn (để bắt được trường hợp đổi mã đoàn), sau đó mới tìm theo ID/Mã đoàn
      const existingTx = await Transaction.findOne(invoiceMatchQuery) || await Transaction.findOne(matchingQuery);
      
      let finalInvoiceCodes = group.invoiceCodes;
      if (existingTx && existingTx.invoiceCode) {
        const oldCodes = existingTx.invoiceCode.split(",").map((s: string) => s.trim()).filter(Boolean);
        finalInvoiceCodes = Array.from(new Set([...oldCodes, ...group.invoiceCodes]));
      }

      // 2. Thực hiện cập nhật (UPSERT thông minh)
      // Nếu tìm thấy bản ghi cũ (dù trùng mã hay trùng hóa đơn), dùng ID của nó để cập nhật
      const updateFilter = existingTx ? { _id: existingTx._id } : matchingQuery;

      await Transaction.findOneAndUpdate(
        updateFilter,
        {
          $setOnInsert: {
            // Chỉ thiết lập các trường cố định sau khi TẠO MỚI bản ghi hoàn toàn
            status: 0, 
            paymentMethod: 0,
            isRevenueChanged: false,
            arrivalDate: createdDate, // Lưu giờ phút giây thực tế khi tạo lần đầu
            customerModifiedDate: createdDate,
            notes: [],
            extraFee: 0,
            extraRevenue: 0,
            paidBy: null,
            updatedBy: null
          },
          $set: {
            // CẬP NHẬT: Luôn lấy thông tin mới nhất từ KiotViet cho các trường này
            code: group.customerCode,
            licensePlate,
            vehicleNumber: licensePlate,
            groups: customerGroups,
            brands,
            customerId,
            isCustomerDeleted: isCustomerDeleted,
            sellerName: firstInv.soldByName || "Hệ thống",
            invoiceCode: finalInvoiceCodes.join(", "),
            syncSource: "KiotViet",
            updatedAt: new Date()
          },
          $inc: {
            // Nếu là cập nhật bản ghi cũ, cộng dồn phần chênh lệch (logic cũ là ghi đè) 
            // Ở đây vì chúng ta đồng bộ toàn bộ ngày, nên nếu tìm thấy bản cũ, chúng ta RESET và ghi đè là an toàn nhất hoặc xử lý cộng dồn.
            // TUY NHIÊN: Để đơn giản và chính xác nhất, chúng ta ghi đè doanh thu từ KiotViet.
            revenue: 0, 
            profit: 0
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      
      // Doanh thu và lợi nhuận nên được $set thay vì $inc nếu chúng ta lấy tổng từ KiotViet
      await Transaction.updateOne(updateFilter, { 
        $set: { 
          revenue: totalRevenue, 
          profit: totalProfit 
        } 
      });

      successCount++;
    }

    // Đánh dấu các hóa đơn đã đồng bộ xong
    await KiotVietInvoice.updateMany(
      { invoiceCode: { $in: unsyncedInvoices.map((i: any) => i.invoiceCode) } },
      { $set: { syncedToTransaction: true } }
    );

    return NextResponse.json({
      message: "Sync and aggregation completed",
      totalInvoicesProcessed: unsyncedInvoices.length,
      unitsUpdated: successCount
    });

    return NextResponse.json({
      message: "Sync completed",
      totalInvoicesFetched: invoices.length,
      newOrUpdatedRecords: successCount
    });

  } catch (error: any) {
    console.error("POST /api/revenue/sync error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
