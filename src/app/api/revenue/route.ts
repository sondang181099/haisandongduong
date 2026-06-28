import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Revenue } from "@/models/Revenue";
import { Invoice } from "@/models/Invoice";
import { Role } from "@/models/Role";
import { User } from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const licensePlate = searchParams.get("licensePlate") || searchParams.get("vehicleNumber");
    const groups = searchParams.get("groups") || searchParams.get("vehicleType");
    const status = searchParams.get("status") || searchParams.get("paymentStatus");
    const paymentMethod = searchParams.get("paymentMethod");
    const paidBy = searchParams.get("paidBy");
    const paidDateFrom = searchParams.get("paidDateFrom") || searchParams.get("paymentDateFrom");
    const paidDateTo = searchParams.get("paidDateTo") || searchParams.get("paymentDateTo");
    const arrivalDate = searchParams.get("arrivalDate");
    const paidDateAt = searchParams.get("paidDateAt");
    const search = searchParams.get("search");
    const showInternal = searchParams.get("showInternal") === "true";
    const presentationMode = searchParams.get("presentationMode") === "true";
    const activeSearch = licensePlate || search;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any)?.role || "Sale";
    const userFullname = (session.user as any)?.fullname || "";
    const isDriverRole = (session.user as any)?.isDriverRole === true;
    const userCars: Array<{ licensePlate?: string; [key: string]: any } | string> = (session.user as any)?.cars || [];

    await connectDB();

    // Tự động tạo index cho bảng snapshot customers_original nếu chưa có để tối ưu hóa lookup
    try {
      Invoice.db.collection("customers_original").createIndex({ customerId: 1, createdAt: -1 }).catch(() => {});
    } catch (e) {
      console.error("Error creating snapshot indexes:", e);
    }

    // Lấy quyền trực tiếp từ database để có hiệu lực ngay lập tức
    const roleData = await Role.findOne({ key: userRole });
    const viewUnpaid = roleData ? !!roleData.viewUnpaid : false;
    const viewPaid = roleData ? !!roleData.viewPaid : false;
    const driverRoleFromDB = roleData ? !!roleData.isDriverRole : false;
    const effectiveIsDriverRole = driverRoleFromDB || isDriverRole;

    const isFullAccess = userRole === "admin" || userRole === "root" || userRole === "manager";

    // Lấy danh sách nhóm xe được xem từ cấu hình tài khoản
    let allowedGroups: string[] = [];
    const userId = (session.user as any)?.id;
    const usernameFromSession = (session.user as any)?.username || (session.user as any)?.email;
    if (userId) {
      const dbUser = await User.findById(userId).select("allowedGroups");
      if (dbUser) {
        allowedGroups = dbUser.allowedGroups || [];
      }
    } else if (usernameFromSession) {
      const dbUser = await User.findOne({ username: usernameFromSession }).select("allowedGroups");
      if (dbUser) {
        allowedGroups = dbUser.allowedGroups || [];
      }
    }

    // 1. Xây dựng điều kiện lọc ban đầu cho Invoices để tăng hiệu năng
    const invoiceMatch: any = { status: 1 }; // Chỉ lấy hóa đơn Hoàn thành
    
    // Loại bỏ các hóa đơn không có cả mã đoàn và biển số xe
    invoiceMatch.$and = [
      {
        $or: [
          { customerCode: { $ne: null, $nin: ["", "Khách lẻ", "Khách lẻ."] } },
          { customerName: { $ne: null, $nin: ["", "Khách lẻ", "Khách lẻ."] } }
        ]
      }
    ];

    if (arrivalDate) {
      const startOfDay = dayjs.tz(arrivalDate, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfDay = dayjs.tz(arrivalDate, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      invoiceMatch.createdDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (!search && !paidDateAt && !paidDateFrom && !paidDateTo) {
      // Nếu không lọc ngày cụ thể, giới hạn trong 60 ngày để tránh quá tải
      invoiceMatch.createdDate = { $gte: dayjs().subtract(60, "day").toDate() };
    }

    // 2. pipeline gom nhóm Invoices và map với Revenues, Customers
    const pipeline: any[] = [
      { $match: invoiceMatch },
      {
        $addFields: {
          dateKey: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdDate", timezone: "Asia/Ho_Chi_Minh" }
          }
        }
      },
      {
        $group: {
          _id: {
            customerId: "$customerId",
            dateKey: "$dateKey"
          },
          customerNames: { $addToSet: "$customerName" },
          customerCode: { $first: "$customerCode" },
          invoices: {
            $push: {
              code: "$code",
              purchaseDate: "$createdDate",
              soldByName: "$soldByName",
              total: "$total",
              mainProducts: {
                $reduce: {
                  input: { $ifNull: ["$invoiceDetails.productName", []] },
                  initialValue: "",
                  in: {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$this",
                      { $concat: ["$$value", ", ", "$$this"] }
                    ]
                  }
                }
              }
            }
          },
          revenue: { $sum: "$total" },
          arrivalDate: { $max: "$createdDate" }
        }
      },
      {
        $project: {
          _id: 0,
          customerId: "$_id.customerId",
          code: "$customerCode",
          dateKey: "$_id.dateKey",
          invoiceCode: { $cond: [{ $eq: [{ $size: "$invoices" }, 1] }, { $arrayElemAt: ["$invoices.code", 0] }, null] },
          revenue: 1,
          arrivalDate: 1,
          childInvoices: "$invoices",
          customerNames: 1
        }
      },
      {
        $lookup: {
          from: "customers",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 }
          ],
          as: "customerInfo"
        }
      },
      {
        $lookup: {
          from: "customers_original",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 }
          ],
          as: "customerOriginalInfo"
        }
      },
      {
        $addFields: {
          customer: { $arrayElemAt: ["$customerInfo", 0] },
          customerOriginal: { $arrayElemAt: ["$customerOriginalInfo", 0] }
        }
      },
      {
        $addFields: {
          plate: {
            $let: {
              vars: {
                invoicePlate: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$customerNames",
                        as: "name",
                        cond: {
                          $and: [
                            { $ne: ["$$name", null] },
                            { $ne: ["$$name", ""] },
                            { $ne: ["$$name", "Khách lẻ"] },
                            { $ne: ["$$name", "Khách lẻ."] }
                          ]
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: {
                $ifNull: [
                  "$$invoicePlate",
                  {
                    $ifNull: [
                      "$customer.name",
                      { $ifNull: ["$customerOriginal.name", "$code"] }
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: "revenues",
          let: { code: "$code", plate: "$plate", dateKey: "$dateKey", invoiceCode: "$invoiceCode" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    {
                      $and: [
                        { $ne: ["$$invoiceCode", null] },
                        { $eq: ["$invoiceCode", "$$invoiceCode"] }
                      ]
                    },
                    {
                      $and: [
                        { $eq: ["$code", "$$code"] },
                        {
                          $eq: [
                            { $dateToString: { format: "%Y-%m-%d", date: "$arrivalDate", timezone: "Asia/Ho_Chi_Minh" } },
                            "$$dateKey"
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "revenueInfo"
        }
      },
      {
        $addFields: {
          rev: { $arrayElemAt: ["$revenueInfo", 0] }
        }
      },
      {
        $project: {
          _id: {
            $cond: [
              { $not: ["$rev"] },
              { $concat: ["virtual_", "$code", "_", "$dateKey", { $cond: ["$invoiceCode", { $concat: ["_", "$invoiceCode"] }, ""] }] },
              "$rev._id"
            ]
          },
          code: 1,
          invoiceCode: 1,
          dateKey: 1,
          revenue: { $cond: [{ $and: ["$rev", "$rev.isFrozen"] }, { $ifNull: ["$rev.frozenRevenue", "$revenue"] }, "$revenue"] },
          arrivalDate: 1,
          childInvoices: 1,
          status: { $ifNull: ["$rev.status", 0] },
          paymentMethod: { $ifNull: ["$rev.paymentMethod", 0] },
          vehicleNumber: { $ifNull: ["$rev.vehicleNumber", { $ifNull: ["$rev.licensePlate", { $ifNull: ["$plate", "$code"] }] }] },
          licensePlate: { $ifNull: ["$rev.licensePlate", { $ifNull: ["$plate", "$code"] }] },
          groups: {
            $ifNull: [
              "$rev.groups",
              {
                $ifNull: [
                  "$customer.groups",
                  { $ifNull: ["$customerOriginal.groups", "Khách lẻ."] }
                ]
              }
            ]
          },
          extraFee: { $ifNull: ["$rev.extraFee", 0] },
          extraRevenue: { $ifNull: ["$rev.extraRevenue", 0] },
          profit: { $ifNull: ["$rev.profit", 0] },
          paidDateAt: "$rev.paidDateAt",
          paidBy: "$rev.paidBy",
          updatedBy: "$rev.updatedBy",
          sellerName: "$rev.sellerName",
          isFrozen: { $ifNull: ["$rev.isFrozen", false] },
          frozenRevenue: "$rev.frozenRevenue",
          isHidden: { $ifNull: ["$rev.isHidden", false] },
          isCustomerDeleted: { $ifNull: ["$rev.isCustomerDeleted", { $ifNull: ["$customer.isDeleted", false] }] }
        }
      }
    ];

    // 3. Lọc điều kiện tìm kiếm và phân quyền ở bước cuối cùng
    const postQuery: any = {};

    if (licensePlate || (search && search.length >= 4)) {
      const rawSearch = licensePlate || search;
      const searchValue = rawSearch ? escapeRegExp(rawSearch) : "";
      postQuery.$or = [
        { licensePlate: { $regex: searchValue, $options: "i" } },
        { code: { $regex: searchValue, $options: "i" } },
        { vehicleNumber: { $regex: searchValue, $options: "i" } }
      ];
    }

    const INTERNAL_GROUPS = ["Khách lẻ", "Nội bộ", "Khách lẻ."];

    if (allowedGroups && allowedGroups.length > 0) {
      if (groups) {
        const types = groups.split(",").filter((t: string) => allowedGroups.includes(t));
        postQuery.groups = { $in: types };
      } else {
        postQuery.groups = { $in: allowedGroups };
      }
    } else {
      if (presentationMode) {
        postQuery.groups = { $nin: INTERNAL_GROUPS };
        postQuery.isHidden = { $ne: true };
      } else if (groups) {
        const types = groups.split(",");
        postQuery.groups = { $in: types };
      } else if (!showInternal) {
        if (postQuery.$or) {
          const existingOr = postQuery.$or;
          delete postQuery.$or;
          postQuery.$and = [
            { $or: existingOr },
            { groups: { $nin: INTERNAL_GROUPS } }
          ];
        } else {
          postQuery.groups = { $nin: INTERNAL_GROUPS };
        }
      }
    }

    // Lọc theo phân quyền status
    if (presentationMode) {
      if (status !== null && status !== undefined && status !== "") {
        postQuery.status = Number(status);
      }
    } else {
      const allowedStatuses = [];
      const driverViewAll = effectiveIsDriverRole && !viewUnpaid && !viewPaid;
      if (viewUnpaid || driverViewAll) allowedStatuses.push(0);
      if (viewPaid || driverViewAll) allowedStatuses.push(1);

      if (status !== null && status !== undefined && status !== "") {
        const requestedStatus = Number(status);
        if (isFullAccess || allowedStatuses.includes(requestedStatus)) {
          postQuery.status = requestedStatus;
        } else {
          postQuery.status = -1;
        }
      } else {
        if (isFullAccess && !viewUnpaid && !viewPaid && !effectiveIsDriverRole) {
          // Admin xem tất cả
        } else if (allowedStatuses.length === 1) {
          postQuery.status = allowedStatuses[0];
        } else if (allowedStatuses.length === 2) {
          postQuery.status = { $in: [0, 1] };
        } else if (!isFullAccess && !effectiveIsDriverRole) {
          postQuery.status = -1;
        }
      }

      if (!isFullAccess && !viewUnpaid && !viewPaid && !effectiveIsDriverRole) {
        postQuery.status = 1;
        if (userFullname) {
          postQuery.sellerName = { $regex: escapeRegExp(userFullname), $options: "i" };
        }
      }
    }

    // Phân quyền theo biển số của Tài xế
    if (effectiveIsDriverRole && !isFullAccess) {
      const userId = (session.user as any)?.id;
      const usernameFromSession = (session.user as any)?.username || (session.user as any)?.email;
      let freshUserCars = userCars;
      if (userId) {
        const freshUser = await User.findById(userId).select("cars");
        if (freshUser) {
          freshUserCars = freshUser.cars || [];
        }
      } else if (usernameFromSession) {
        const freshUser = await User.findOne({ username: usernameFromSession }).select("cars");
        if (freshUser) {
          freshUserCars = freshUser.cars || [];
        }
      }

      const driverLicensePlates: string[] = freshUserCars
        .map((car: any) => {
          if (typeof car === "string") return car;
          return (car as any)?.licensePlate || "";
        })
        .filter(Boolean);

      if (driverLicensePlates.length === 0) {
        return NextResponse.json({ transactions: [], totals: { totalRevenue: 0, totalExtraFee: 0, totalProfit: 0, totalCash: 0, totalTransfer: 0 } });
      }

      const vehicleConditions = driverLicensePlates.map((plate) => [
        { vehicleNumber: { $regex: `^${plate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
        { licensePlate: { $regex: `^${plate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
      ]).flat();

      if (postQuery.$and) {
        postQuery.$and.push({ $or: vehicleConditions });
      } else if (postQuery.$or) {
        const existingOr = postQuery.$or;
        delete postQuery.$or;
        postQuery.$and = [{ $or: existingOr }, { $or: vehicleConditions }];
      } else {
        postQuery.$or = vehicleConditions;
      }
    }

    if (paymentMethod !== null && paymentMethod !== undefined && paymentMethod !== "") {
      postQuery.paymentMethod = Number(paymentMethod);
    }
    if (paidBy) {
      postQuery.paidBy = { $regex: escapeRegExp(paidBy), $options: "i" };
    }
    if (paidDateFrom || paidDateTo) {
      postQuery.paidDateAt = {};
      if (paidDateFrom) {
        postQuery.paidDateAt.$gte = dayjs.tz(paidDateFrom, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      }
      if (paidDateTo) {
        postQuery.paidDateAt.$lte = dayjs.tz(paidDateTo, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      }
    }
    if (paidDateAt && !paidDateFrom && !paidDateTo) {
      const startOfDay = dayjs.tz(paidDateAt, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfDay = dayjs.tz(paidDateAt, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      postQuery.paidDateAt = { $gte: startOfDay, $lte: endOfDay };
    }

    pipeline.push({ $match: postQuery });

    // Sắp xếp
    pipeline.push({
      $addFields: {
        effectiveDate: { $ifNull: ["$arrivalDate", "$dateKey"] }
      }
    });
    pipeline.push({ $sort: { effectiveDate: -1 } });

    const isExport = searchParams.get("export") === "true";
    if (!isExport) {
      pipeline.push({ $project: { childInvoices: 0 } });
    }

    const transactions = await Invoice.aggregate(pipeline);

    // Bổ sung các khách hàng tạo mới/sửa đổi trong ngày hôm nay vào danh sách hiển thị mặc định (dù chưa có hóa đơn)
    try {
      const targetDateStr = arrivalDate || dayjs().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
      const startOfTargetDay = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfTargetDay = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").endOf("day").toDate();

      const existingCodes = new Set(transactions.map(t => t.code?.toLowerCase()).filter(Boolean));
      const customerQuery: any = {
        createdAt: { $gte: startOfTargetDay, $lte: endOfTargetDay },
        isDeleted: { $ne: true }
      };

      if (activeSearch && activeSearch.length >= 3) {
        const escapedSearch = activeSearch.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        customerQuery.$or = [
          { code: { $regex: escapedSearch, $options: "i" } },
          { name: { $regex: escapedSearch, $options: "i" } }
        ];
      }

      const { Customer } = await import("@/models/Customer");
      const todayCustomers = await Customer.find(customerQuery).sort({ createdAt: -1 });

      // Lấy danh sách các mã khách hàng đã bị ẩn trong ngày hôm nay trong bảng revenues
      const hiddenRevenues = await Revenue.find({
        arrivalDate: { $gte: startOfTargetDay, $lte: endOfTargetDay },
        isHidden: true
      }).select("code");
      const hiddenCodes = new Set(hiddenRevenues.map(r => r.code.toLowerCase()));

      const mergedCustomers = todayCustomers;
      const processedVirtualCodes = new Set<string>();

      for (const dbCustomer of mergedCustomers) {
        const lowerCode = dbCustomer.code.toLowerCase();
        const groupValue = dbCustomer.groups || "Khách lẻ.";

        const isHidden = hiddenCodes.has(lowerCode);
        
        // Nếu ở chế độ trình chiếu (presentationMode = true) và bị ẩn thì bỏ qua hẳn
        if (presentationMode && isHidden) {
          continue;
        }
        if (existingCodes.has(lowerCode) || processedVirtualCodes.has(lowerCode)) {
          continue;
        }
        if (allowedGroups && allowedGroups.length > 0 && !allowedGroups.includes(groupValue)) {
          continue;
        }
        if (presentationMode && INTERNAL_GROUPS.includes(groupValue)) {
          continue;
        }
        if (!showInternal && allowedGroups.length === 0 && INTERNAL_GROUPS.includes(groupValue)) {
          continue;
        }

        processedVirtualCodes.add(lowerCode);
        const virtualTx = {
          _id: `virtual_${dbCustomer.code}_${targetDateStr}`,
          code: dbCustomer.code,
          licensePlate: dbCustomer.name || "Chưa xác định",
          vehicleNumber: dbCustomer.name || "Chưa xác định",
          groups: groupValue,
          revenue: 0,
          profit: 0,
          status: 0,
          paymentMethod: 0,
          extraFee: 0,
          extraRevenue: 0,
          isCustomerDeleted: dbCustomer.isDeleted,
          arrivalDate: dbCustomer.createdAt,
          createdAt: dbCustomer.createdAt,
          updatedAt: dbCustomer.updatedAt,
          isVirtual: true,
          isHidden: isHidden // Gán thuộc tính isHidden thực tế để frontend hiển thị badge "Đã ẩn"
        };
        transactions.push(virtualTx);
      }
    } catch (e) {
      console.error("Error appending today's customer virtual transactions:", e);
    }

    // Nếu có từ khóa tìm kiếm và kết quả transactions trống hoặc không chứa mã đó
    if (activeSearch && activeSearch.length >= 3) {
      const matchCode = activeSearch.trim();
      const hasMatch = transactions.some(t => t.code && t.code.toLowerCase() === matchCode.toLowerCase());
      if (!hasMatch) {
        const mongoose = require("mongoose");
        const { Customer } = await import("@/models/Customer");
        const escapedSearch = matchCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        let dbCustomer = await Customer.findOne({
          code: { $regex: `^${escapedSearch}$`, $options: "i" }
        }).sort({ createdAt: -1 });

        if (!dbCustomer) {
          const db = mongoose.connection.db;
          dbCustomer = await db.collection("customers_original").findOne({
            code: { $regex: `^${escapedSearch}$`, $options: "i" }
          });
        }

        if (dbCustomer) {
          const groupValue = dbCustomer.groups || "Khách lẻ.";
          const lowerCode = dbCustomer.code.toLowerCase();
          
          // Kiểm tra xem khách hàng có bị ẩn cục bộ ngày hôm nay không
          const targetDateStr = dayjs().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
          const startOfTargetDay = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").startOf("day").toDate();
          const endOfTargetDay = dayjs.tz(targetDateStr, "Asia/Ho_Chi_Minh").endOf("day").toDate();
          
          const isHiddenToday = await Revenue.findOne({
            code: dbCustomer.code,
            arrivalDate: { $gte: startOfTargetDay, $lte: endOfTargetDay },
            isHidden: true
          });

          const isHidden = !!isHiddenToday;

          // Nếu ở chế độ trình chiếu (presentationMode = true) và bị ẩn thì bỏ qua hẳn
          if (presentationMode && isHidden) {
            // Không chèn
          } else if (!allowedGroups || allowedGroups.length === 0 || allowedGroups.includes(groupValue)) {
            const virtualTx = {
              _id: `virtual_${dbCustomer.code}_${targetDateStr}`,
              code: dbCustomer.code,
              licensePlate: dbCustomer.name || "Chưa xác định",
              vehicleNumber: dbCustomer.name || "Chưa xác định",
              groups: groupValue,
              revenue: 0,
              profit: 0,
              status: 0,
              paymentMethod: 0,
              extraFee: 0,
              extraRevenue: 0,
              isCustomerDeleted: dbCustomer.isDeleted,
              arrivalDate: dbCustomer.createdAt || new Date(),
              createdAt: dbCustomer.createdAt || new Date(),
              updatedAt: dbCustomer.updatedAt || new Date(),
              isVirtual: true,
              isHidden: isHidden // Gán thuộc tính isHidden thực tế để frontend hiển thị badge "Đã ẩn"
            };
            transactions.unshift(virtualTx);
          }
        }
      }
    }

    // 4. Map tên nhân viên in-memory
    const users = await User.find({}).select("username fullname fullName");
    const nameMap = new Map<string, string>();
    users.forEach(u => {
      const name = u.fullname || u.fullName || u.username;
      nameMap.set(u._id.toString(), name);
      if (u.username) {
        nameMap.set(u.username.toLowerCase(), name);
      }
    });

    transactions.forEach(t => {
      if (t.paidBy) {
        const paidByStr = t.paidBy.toString();
        if (nameMap.has(paidByStr)) {
          t.paidBy = nameMap.get(paidByStr);
        } else if (nameMap.has(paidByStr.toLowerCase())) {
          t.paidBy = nameMap.get(paidByStr.toLowerCase());
        }
      }
      if (t.updatedBy) {
        const updatedByStr = t.updatedBy.toString();
        if (nameMap.has(updatedByStr)) {
          t.updatedBy = nameMap.get(updatedByStr);
        } else if (nameMap.has(updatedByStr.toLowerCase())) {
          t.updatedBy = nameMap.get(updatedByStr.toLowerCase());
        }
      }
    });

    // Sắp xếp lại danh sách transactions theo ngày đến (arrivalDate) mới nhất (descending)
    transactions.sort((a, b) => {
      const dateA = new Date(a.arrivalDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.arrivalDate || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    // 5. Tính toán tổng số tiền (Totals)
    const totals = { totalRevenue: 0, totalExtraFee: 0, totalProfit: 0, totalCash: 0, totalTransfer: 0 };
    const showTotals = isFullAccess || viewUnpaid;

    if (showTotals) {
      transactions.forEach(t => {
        if (t.isCustomerDeleted) return;
        totals.totalRevenue += Number(t.revenue || 0);
        totals.totalExtraFee += Number(t.extraFee || 0) + Number(t.extraRevenue || 0);
        totals.totalProfit += Number(t.profit || 0);
        if (Number(t.paymentMethod) === 1) {
          totals.totalCash += Number(t.profit || 0);
        } else if (Number(t.paymentMethod) === 2) {
          totals.totalTransfer += Number(t.profit || 0);
        }
      });
    }

    return NextResponse.json({
      transactions,
      totals,
    });
  } catch (error) {
    console.error("GET /api/revenue error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
