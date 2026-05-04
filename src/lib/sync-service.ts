import { connectDB } from "./mongodb";
import { KiotViet } from "../models/KiotViet";
import { refreshKiotVietToken } from "./kiotviet-auth";
import { Transaction } from "../models/Transaction";
import { VehicleProfitConfig } from "../models/VehicleProfitConfig";
import { calculateProfit } from "./commission";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { emitRevenueUpdate } from "./socket-server";

dayjs.extend(utc);
dayjs.extend(timezone);

const RETAILER_CODE = "haisandongduog";
const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Xóa khách hàng trên KiotViet qua API
 */
export async function deleteKiotVietCustomer(customerId: string | number): Promise<boolean> {
  const accessToken = await refreshKiotVietToken();
  if (!accessToken) throw new Error("Không thể lấy token KiotViet");

  const response = await fetch(`https://public.kiotapi.com/customers/${customerId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Retailer": RETAILER_CODE,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) return true; // Đã xóa hoặc không tồn tại
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi khi xóa khách hàng KiotViet (${response.status})`);
  }

  return true;
}

/**
 * @deprecated Hàm này đã được thay thế bằng script Python (sync_kiotviet.py) để tối ưu hiệu suất.
 * Chỉ nên dùng cho các tác vụ tra cứu nhỏ lẻ nếu cần.
 */
export async function processInvoicesToTransactions(invoices: any[], accessToken: string) {

  if (!invoices || invoices.length === 0) return 0;

  // 1. Gom nhóm các hóa đơn theo khách hàng và ngày
  const groupsMap: Record<string, any> = {};

  for (const inv of invoices) {
    const rawCode = inv.customerCode || "Khách lẻ";
    if (rawCode === "Khách lẻ" || rawCode.toLowerCase().includes("khách lẻ")) {
      // Optimization: Bỏ qua hóa đơn khách lẻ vãng lai không có mã đoàn
      continue;
    }
    const customerCode = rawCode.split("{")[0].trim();
    
    const dateKey = dayjs.tz(inv.createdDate, "Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
    const groupKey = customerCode === "Khách lẻ" ? `${customerCode}_${dateKey}_${inv.code}` : `${customerCode}_${dateKey}`;

    if (!groupsMap[groupKey]) {
      groupsMap[groupKey] = {
        customerCode,
        dateKey,
        invoices: [],
        totalRevenue: 0,
        totalProfit: 0,
        invoiceCodes: [],
        cancelledCodes: []
      };
    }

    // Phân loại hóa đơn
    if (inv.status === 2) {
      // Hóa đơn bị hủy
      groupsMap[groupKey].cancelledCodes.push(inv.code);
    } else {
      // Hóa đơn hợp lệ
      const revenue = inv.total || 0;
      groupsMap[groupKey].totalRevenue += revenue;
      groupsMap[groupKey].invoiceCodes.push(inv.code);
      groupsMap[groupKey].invoices.push(inv);
    }
  }

  // 2. Cập nhật hoặc tạo mới Transaction cho từng nhóm (Đa luồng)
  let successCount = 0;
  const groupKeys = Object.keys(groupsMap);
  const invoiceDbConcurrency = 30;

  for (let i = 0; i < groupKeys.length; i += invoiceDbConcurrency) {
    const chunk = groupKeys.slice(i, i + invoiceDbConcurrency);
    await Promise.all(chunk.map(async (key) => {
      const group = groupsMap[key];
    
      const sortedInvoices = [...group.invoices].sort((a: any, b: any) => 
        new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
      );
      
      const latestInv = sortedInvoices.length > 0 ? sortedInvoices[sortedInvoices.length - 1] : null;
      const startOfDay = dayjs.tz(group.dateKey, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfDay = dayjs.tz(group.dateKey, "Asia/Ho_Chi_Minh").endOf("day").toDate();

      let customerGroups = "Khách lẻ."; 
      let licensePlate = latestInv?.customerName || group.customerCode || "Khách lẻ.";
      let customerId = latestInv?.customerId || null;
      let isCustomerDeleted = latestInv?.customerCode?.includes("{DEL}") || false;
      
      if (group.customerCode && group.customerCode !== "Khách lẻ") {
        try {
          const cleanCode = group.customerCode.split("{")[0];
          const localRecord = await Transaction.findOne({ 
            code: { $regex: `^${escapeRegExp(cleanCode)}$`, $options: "i" } 
          }).sort({ updatedAt: -1 }).lean();
          
          if (localRecord && localRecord.groups) {
            licensePlate = localRecord.licensePlate || licensePlate;
            customerGroups = localRecord.groups || customerGroups;
            customerId = localRecord.customerId || customerId;
            isCustomerDeleted = localRecord.isCustomerDeleted || false;
          } else {
            console.log(`[Sync] Local record not found for ${cleanCode}, fetching from KiotViet...`);
            const searchParam = `code=${encodeURIComponent(cleanCode)}&includeCustomerGroup=true`;
            const custRes = await fetch(`https://public.kiotapi.com/customers?${searchParam}`, {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Retailer": RETAILER_CODE,
              },
            });

            if (custRes.ok) {
              const custData = await custRes.json();
              const customer = custData.data?.find((c: any) => c.code === cleanCode) || custData.data?.[0];
              
              if (customer) {
                const bestName = customer.licensePlate || (customer.name && !customer.name.includes("{DEL}") ? customer.name : null);
                if (bestName) licensePlate = bestName;
                if (customer.groups) customerGroups = customer.groups;
                customerId = customer.id || customerId;
                if (customer.name?.includes("{DEL}")) isCustomerDeleted = true;
              }
            }
          }
        } catch (e) { console.error("Fetch customer lookup error:", e); }
      }

      const brands = customerGroups.split(",").map((g: string) => g.trim()).filter(Boolean);

      let totalRevenue = 0;
      for (const inv of group.invoices) {
        totalRevenue += (inv.total || 0);
      }

      const totalProfit = 0; 
      const arrivalDate = latestInv 
        ? dayjs.tz(latestInv.createdDate, "Asia/Ho_Chi_Minh").toDate()
        : dayjs.tz(group.dateKey, "Asia/Ho_Chi_Minh").startOf("day").toDate();

      const newChildInvoices = group.invoices.map((inv: any) => {
        const productNames = (inv.invoiceDetails || []).map((d: any) => d.productName).join(", ");
        return {
          code: inv.code,
          purchaseDate: dayjs.tz(inv.purchaseDate || inv.createdDate, "Asia/Ho_Chi_Minh").toDate(),
          soldByName: inv.soldByName || "Hệ thống",
          total: inv.total || 0,
          mainProducts: productNames
        };
      });
      const invoiceMatchQuery = {
        arrivalDate: { $gte: startOfDay, $lte: endOfDay },
        invoiceCode: { $regex: group.invoiceCodes.map((c: string) => `\\b${c}\\b`).join('|') }
      };

      const matchingQuery = group.customerCode === "Khách lẻ" ? null : {
        arrivalDate: { $gte: startOfDay, $lte: endOfDay },
        $or: [
          ...(customerId ? [{ customerId: customerId }] : []),
          { code: { $regex: `^${escapeRegExp(group.customerCode)}$`, $options: "i" } }
        ]
      };

      const existingTx = await Transaction.findOne(invoiceMatchQuery) || (matchingQuery ? await Transaction.findOne(matchingQuery) : null);

      
      let finalChildInvoices = newChildInvoices;
      let finalInvoiceCodes = group.invoiceCodes;

      if (existingTx) {
        // Gộp chi tiết hóa đơn con (Tránh trùng lặp theo mã hóa đơn và XÓA hóa đơn đã hủy)
        const childMap = new Map();
        
        // 1. Thêm hóa đơn cũ (Bỏ qua những cái đã bị hủy)
        if (existingTx.childInvoices) {
          existingTx.childInvoices.forEach((ci: any) => {
            const rawCi = ci.toObject ? ci.toObject() : ci;
            if (!group.cancelledCodes.includes(rawCi.code)) {
              childMap.set(rawCi.code, rawCi);
            }
          });
        }
        
        // 2. Thêm/Cập nhật hóa đơn mới từ sync lần này
        newChildInvoices.forEach((ci: any) => childMap.set(ci.code, ci));
        
        // 3. Kết quả danh sách hóa đơn cuối cùng
        finalChildInvoices = Array.from(childMap.values());
        
        // 4. Tính toán lại Doanh thu và Mã hóa đơn từ danh sách cuối cùng
        totalRevenue = finalChildInvoices.reduce((sum: number, ci: any) => sum + (ci.total || 0), 0);
        finalInvoiceCodes = finalChildInvoices.map((ci: any) => ci.code);
      }

      const updateFilter = existingTx ? { _id: existingTx._id } : (matchingQuery || { invoiceCode: finalInvoiceCodes.join(", ") });

      await Transaction.findOneAndUpdate(
        updateFilter,
        {
          $setOnInsert: {
            status: 0, 
            paymentMethod: 0,
            isRevenueChanged: false,
            notes: [],
            extraFee: 0,
            extraRevenue: 0,
            paidBy: null,
            updatedBy: null
          },
          $set: {
            code: group.customerCode,
            licensePlate,
            vehicleNumber: licensePlate,
            groups: customerGroups,
            brands,
            customerId,
            isCustomerDeleted: isCustomerDeleted,
            revenue: totalRevenue, 
            profit: totalProfit,
            ...( (existingTx && (!existingTx.arrivalDate || arrivalDate > existingTx.arrivalDate)) || !existingTx ? { arrivalDate, customerModifiedDate: arrivalDate } : {} ),
            invoiceCode: finalInvoiceCodes.join(", "),
            childInvoices: finalChildInvoices,
            syncSource: "KiotViet",
            sellerName: latestInv?.soldByName || "Hệ thống",
            updatedAt: new Date(),
          }
        },
        { upsert: true }
      );

      successCount++;
    }));
  }
  
  return successCount;
}

/**
 * @deprecated Đã thay thế bằng Python Sync. 
 * Việc gọi hàm này trong Node.js hiện tại không còn hiệu quả bằng Python.
 */
export async function runKiotVietSync(range: string = "1day") {

  try {
    await connectDB();
    await refreshKiotVietToken();

    const kiotTokenRecord = await KiotViet.findOne({ key: "kiotviet" }).lean();
    if (!kiotTokenRecord || !kiotTokenRecord.accessToken) {
      console.error("[Sync Service] No KiotViet token found in database.");
      return { error: "No token found" };
    }

    const { accessToken } = kiotTokenRecord;
    // @ts-ignore
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    let fromDate = dayjs().tz("Asia/Ho_Chi_Minh").startOf("day").format("YYYY-MM-DDTHH:mm:ss");
    const toDate = dayjs().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DDTHH:mm:ss");

    if (range === "auto") {
      if (kiotTokenRecord.lastSyncAt) {
        const lastSync = dayjs(kiotTokenRecord.lastSyncAt).tz("Asia/Ho_Chi_Minh");
        const isToday = lastSync.isSame(dayjs().tz("Asia/Ho_Chi_Minh"), 'day');
        if (isToday) {
          // Lùi lại 2 phút để bù đắp sai số đồng hồ/trễ mạng
          fromDate = lastSync.subtract(2, "minute").format("YYYY-MM-DDTHH:mm:ss");
          console.log(`[Sync Service] Auto-sync detected: Using buffered start time ${fromDate}`);
        } else {
          console.log(`[Sync Service] Auto-sync detected: New day starting, using full day sync.`);
        }
      }
    } else if (range === "30min") {
      fromDate = dayjs().tz("Asia/Ho_Chi_Minh").subtract(30, "minute").format("YYYY-MM-DDTHH:mm:ss");
    } else if (range === "yesterday") {
      fromDate = dayjs().tz("Asia/Ho_Chi_Minh").subtract(1, "day").startOf("day").format("YYYY-MM-DDTHH:mm:ss");
    } else if (range === "7days") {
      fromDate = dayjs().tz("Asia/Ho_Chi_Minh").subtract(7, "day").startOf("day").format("YYYY-MM-DDTHH:mm:ss");
    } else if (range === "30days") {
      fromDate = dayjs().tz("Asia/Ho_Chi_Minh").subtract(30, "day").startOf("day").format("YYYY-MM-DDTHH:mm:ss");
    }

    console.log(`[Sync Service] Fetching data from ${fromDate} to ${toDate}...`);

    const fetchAllConcurrent = async (baseUrl: string, pageSize: number): Promise<any[]> => {
      const headers = {
        "Authorization": `Bearer ${accessToken}`,
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-app/1.0",
        "Accept": "application/json"
      };

      const firstRes = await fetch(`${baseUrl}&pageSize=${pageSize}&currentItem=0`, { headers });
      if (!firstRes.ok) {
        console.error(`[Sync Service] First API call failed: ${firstRes.status}`);
        return [];
      }
      const firstJson = await firstRes.json();
      let allData = firstJson.data || [];
      const total = firstJson.total || 0;

      if (total > pageSize) {
        const skips = [];
        for (let i = pageSize; i < total; i += pageSize) {
          skips.push(i);
        }

        const concurrency = 4;
        for (let i = 0; i < skips.length; i += concurrency) {
          const chunk = skips.slice(i, i + concurrency);
          const promises = chunk.map(async (skip) => {
            const url = `${baseUrl}&pageSize=${pageSize}&currentItem=${skip}`;
            const chunkRes = await fetch(url, { headers });
            if (chunkRes.ok) {
              const chunkJson = await chunkRes.json();
              return chunkJson.data || [];
            }
            return [];
          });
          const results = await Promise.all(promises);
          for (const data of results) {
            allData = [...allData, ...data];
          }
        }
      }
      return allData;
    };

    // 1. Đồng bộ khách hàng mới 
    let hasCustomerChanges = false;
    try {
      const baseCustomersUrl = `https://public.kiotapi.com/customers?orderBy=createdDate&orderDirection=Desc&lastModifiedFrom=${fromDate}&includeCustomerGroup=true`;
      const customers = await fetchAllConcurrent(baseCustomersUrl, 200);

      if (customers.length > 0) {
        console.log(`[Sync Service] Found ${customers.length} new/modified customers to sync.`);
      }

      const customerDbConcurrency = 50; 
      for (let i = 0; i < customers.length; i += customerDbConcurrency) {
        const chunk = customers.slice(i, i + customerDbConcurrency);
        await Promise.all(chunk.map(async (customer) => {
          if (customer.name?.includes("{DEL}")) return;
        
          // Optimization: Bỏ qua khách lẻ không có thông tin nhóm hoặc biển số để giảm tải
          const customerGroups = customer.groups || "";
          const licensePlate = customer.licensePlate || "";
          if (customer.code === "Khách lẻ" || (!customerGroups && !licensePlate && customer.code?.length > 10)) {
             // Thường khách lẻ tự tạo code sẽ dài, hoặc tên mặc định là Khách lẻ
             // Tuy nhiên nếu có group thì vẫn lấy
             if (!customerGroups && !licensePlate) return;
          }

          const customerCode = customer.code;
          const targetDateStr = customer.modifiedDate || customer.createdDate;
          const arrivalDate = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").toDate();
          const startOfDay = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").startOf("day").toDate();
          const endOfDay = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").endOf("day").toDate();
          
          const finalLicensePlate = customer.licensePlate || customer.name || "Khách lẻ.";
          const finalGroups = customerGroups || "Khách lẻ.";
          const brands = finalGroups.split(",").map((g: string) => g.trim()).filter(Boolean);
          const customerId = customer.id;



          const matchQuery = {
            arrivalDate: { $gte: startOfDay, $lte: endOfDay },
            $or: [
              { customerId: customerId }, 
              { code: { $regex: `^${escapeRegExp(customerCode)}$`, $options: "i" } }
            ]
          };

          await Transaction.findOneAndUpdate(
            matchQuery,
            {
              $setOnInsert: {
                revenue: 0, profit: 0, status: 0, 
                paymentMethod: 0, isRevenueChanged: false,
                customerModifiedDate: arrivalDate, notes: [],
                extraFee: 0, extraRevenue: 0,
                arrivalDate: arrivalDate, paidBy: null, updatedBy: null
              },
              $set: {
                code: customerCode, licensePlate: finalLicensePlate, vehicleNumber: finalLicensePlate,
                groups: finalGroups, brands, customerId,
                syncSource: "KiotViet", updatedAt: new Date()
              }
            },
            { upsert: true }
          );
          hasCustomerChanges = true;
        }));
      }
    } catch (e) {
      console.error("[Sync Service] Error syncing customers:", e);
    }

    // 2. Đồng bộ hóa đơn
    const dateParam = range === "auto" ? `lastModifiedFrom=${fromDate}` : `fromDate=${fromDate}&toDate=${toDate}`;
    const baseInvoicesUrl = `https://public.kiotapi.com/invoices?orderBy=createdDate&orderDirection=Desc&${dateParam}&includeInvoiceDetails=true`;
    const invoices = await fetchAllConcurrent(baseInvoicesUrl, 200);

    if (invoices.length > 0) {
      console.log(`[Sync Service] Total invoices to process: ${invoices.length}`);
    }

    // 3. Xử lý lưu vào DB sử dụng hàm core
    const successCount = await processInvoicesToTransactions(invoices, accessToken);

    console.log(`[Sync Service] Sync completed. Processed ${invoices.length} invoices, updated ${successCount} units.`);
    
    // Phát tín hiệu WebSocket chỉ khi có sự thay đổi dữ liệu thực tế (Khách hàng hoặc Hóa đơn)
    if (successCount > 0 || hasCustomerChanges) {
      console.log(`[Sync Service] Data changed (Customers: ${hasCustomerChanges}, Invoices: ${successCount}), emitting update signal.`);
      emitRevenueUpdate();
    }

    // Lưu lại thời điểm đồng bộ thành công
    try {
      await KiotViet.updateOne({ key: "kiotviet" }, { $set: { lastSyncAt: new Date() } });
    } catch (e) {
      console.error("[Sync Service] Failed to updated lastSyncAt:", e);
    }

    return {
      success: true,
      totalInvoicesProcessed: invoices.length,
      unitsUpdated: successCount
    };

  } catch (error: any) {
    console.error("[Sync Service] Critical error:", error);
    return { error: error.message };
  }
}

export async function getInvoicesByCustomerCode(code: string) {
  try {
    await connectDB();
    await refreshKiotVietToken();
    const kiotTokenRecord = await KiotViet.findOne({ key: "kiotviet" }).lean();
    if (!kiotTokenRecord || !kiotTokenRecord.accessToken) throw new Error("No token found");

    const { accessToken } = kiotTokenRecord;
    const fromDate = dayjs().tz("Asia/Ho_Chi_Minh").startOf("day").format("YYYY-MM-DDTHH:mm:ss");

    // Lấy thông tin khách hàng để có ID
    const custRes = await fetch(`https://public.kiotapi.com/customers?code=${code}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Retailer": RETAILER_CODE
      }
    });
    const custJson = await custRes.json();
    if (!custJson.data || custJson.data.length === 0) return [];

    const customerId = custJson.data[0].id;

    // Lấy hóa đơn
    const invRes = await fetch(`https://public.kiotapi.com/invoices?customerId=${customerId}&lastModifiedFrom=${fromDate}&includeInvoiceDetails=true`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Retailer": RETAILER_CODE
      }
    });
    const invJson = await invRes.json();
    const invoices = invJson.data || [];

    // Tự động đồng bộ các hóa đơn này vào database ngay lập tức nếu chúng mới
    if (invoices.length > 0) {
      console.log(`[Sync Service] Instantly syncing ${invoices.length} invoices for customer ${code}`);
      const successCount = await processInvoicesToTransactions(invoices, accessToken);
      // Phát tín hiệu WebSocket để UI có thể cập nhật bảng ngoài
      if (successCount > 0) {
        emitRevenueUpdate();
      }
    }

    return invoices;

  } catch (error) {
    console.error("[Sync Service] getInvoicesByCustomerCode error:", error);
    throw error;
  }
}
