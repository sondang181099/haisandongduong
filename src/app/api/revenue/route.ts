import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/models/Transaction";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    const search = searchParams.get("search");
    const showInternal = searchParams.get("showInternal") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any)?.role || "Sale";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userFullname = (session.user as any)?.fullname || "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {
      code: { $ne: "Khách lẻ" } // Ẩn đơn khách lẻ khỏi giao diện chính
    };

    if (licensePlate || (search && search.length >= 4)) {
      const rawSearch = licensePlate || search;
      const searchValue = rawSearch ? escapeRegExp(rawSearch) : "";
      
      query.$or = [
        { licensePlate: { $regex: searchValue, $options: "i" } },
        { code: { $regex: searchValue, $options: "i" } },
        { vehicleNumber: { $regex: searchValue, $options: "i" } }
      ];
    }
    if (groups) {
      const types = groups.split(",");
      query.groups = { $in: types };
    } else if (!showInternal) {
      // Mặc định lọc bỏ xe nội bộ nếu không chọn cụ thể nhóm nào và không bật "Hiển thị xe nội bộ"
      query.groups = { $not: { $regex: "Nội bộ", $options: "i" } };
    }
    const isFullAccess = userRole === "admin" || userRole === "root" || userRole === "manager";
    const viewUnpaid = (session.user as any).viewUnpaid === true;

    if (isFullAccess) {
      if (status !== null && status !== undefined && status !== "") {
        query.status = Number(status);
      }
    } else if (viewUnpaid) {
      // Nhóm được phép xem đơn chưa thanh toán
      query.status = 0;
    } else {
      // Còn lại: CHỈ xem được đơn ĐÃ THANH TOÁN
      query.status = 1;
      if (userFullname) {
        query.sellerName = { $regex: escapeRegExp(userFullname), $options: "i" };
      }
    }
    if (paymentMethod !== null && paymentMethod !== undefined && paymentMethod !== "") {
      query.paymentMethod = Number(paymentMethod);
    }
    if (paidBy) {
      query.paidBy = paidBy;
    }
    if (paidDateFrom || paidDateTo) {
      query.paidDateAt = {};
      if (paidDateFrom) query.paidDateAt.$gte = new Date(paidDateFrom);
      if (paidDateTo) query.paidDateAt.$lte = new Date(paidDateTo);
    }
    if (arrivalDate) {
      const date = new Date(arrivalDate);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      query.arrivalDate = { $gte: date, $lt: nextDay };
    }

    await connectDB();

    // Sử dụng Aggregate để JOIN với bảng users
    const transactions = await Transaction.aggregate([
      { $match: query },
      // Ưu tiên sắp xếp theo Ngày đến (customerModifiedDate), sau đó là updatedAt
      { $sort: { customerModifiedDate: -1, updatedAt: -1 } },
      // Bước A: Chuyển đổi paidBy và updatedBy sang ObjectId nếu là chuỗi ID 24 ký tự
      {
        $addFields: {
          tempPaidByStr: { $toString: { $ifNull: ["$paidBy", ""] } },
          tempUpdatedByStr: { $toString: { $ifNull: ["$updatedBy", ""] } }
        }
      },
      {
        $addFields: {
          paidByObjId: {
            $cond: {
              if: { $regexMatch: { input: "$tempPaidByStr", regex: /^[0-9a-fA-F]{24}$/ } },
              then: { $toObjectId: "$tempPaidByStr" },
              else: null
            }
          },
          updatedByObjId: {
            $cond: {
              if: { $regexMatch: { input: "$tempUpdatedByStr", regex: /^[0-9a-fA-F]{24}$/ } },
              then: { $toObjectId: "$tempUpdatedByStr" },
              else: null
            }
          }
        }
      },
      // Bước B: Lookup bảng users
      {
        $lookup: {
          from: "users",
          localField: "paidByObjId",
          foreignField: "_id",
          as: "payerById"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "paidBy",
          foreignField: "username",
          as: "payerByUsername"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "updatedByObjId",
          foreignField: "_id",
          as: "updaterById"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "updatedBy",
          foreignField: "username",
          as: "updaterByUsername"
        }
      },
      // Bước C: Kết hợp các kết quả tìm được
      {
        $addFields: {
          payerInfo: { $concatArrays: ["$payerById", "$payerByUsername"] },
          updaterInfo: { $concatArrays: ["$updaterById", "$updaterByUsername"] }
        }
      },
      // Bước D: Ghi đè fullname vào kết quả
      {
        $addFields: {
          paidBy: {
            $cond: {
              if: { $gt: [{ $size: "$payerInfo" }, 0] },
              then: { 
                $ifNull: [
                  { $arrayElemAt: ["$payerInfo.fullname", 0] }, 
                  { $arrayElemAt: ["$payerInfo.fullName", 0] },
                  "$paidBy"
                ] 
              },
              else: "$paidBy"
            }
          },
          updatedBy: {
            $cond: {
              if: { $gt: [{ $size: "$updaterInfo" }, 0] },
              then: { 
                $ifNull: [
                  { $arrayElemAt: ["$updaterInfo.fullname", 0] }, 
                  { $arrayElemAt: ["$updaterInfo.fullName", 0] },
                  "$updatedBy"
                ] 
              },
              else: "$updatedBy"
            }
          }
        }
      },
      // Bước E: Xóa các trường trung gian
      {
        $project: {
          payerInfo: 0,
          updaterInfo: 0,
          payerById: 0,
          payerByUsername: 0,
          updaterById: 0,
          updaterByUsername: 0,
          paidByObjId: 0,
          updatedByObjId: 0,
          tempPaidByStr: 0,
          tempUpdatedByStr: 0
        }
      }
    ]);

    // Calculate totals - Truy vấn tổng trên toàn bộ tập dữ liệu (không bị limit 500)
    let totals = { totalRevenue: 0, totalExtraFee: 0, totalProfit: 0, totalCash: 0, totalTransfer: 0 };
    
    const showTotals = isFullAccess || viewUnpaid;
    
    if (showTotals) {
      const totalsAggregation = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $toDouble: { $ifNull: ["$revenue", 0] } } },
            totalExtraFee: { 
              $sum: { 
                $add: [
                  { $toDouble: { $ifNull: ["$extraFee", 0] } }, 
                  { $toDouble: { $ifNull: ["$extraRevenue", 0] } }
                ] 
              } 
            },
            totalProfit: { $sum: { $toDouble: { $ifNull: ["$profit", 0] } } },
            totalCash: {
              $sum: {
                $cond: [
                  { $eq: [{ $toInt: { $ifNull: ["$paymentMethod", 0] } }, 1] }, 
                  { $toDouble: { $ifNull: ["$profit", 0] } }, 
                  0
                ]
              }
            },
            totalTransfer: {
              $sum: {
                $cond: [
                  { $eq: [{ $toInt: { $ifNull: ["$paymentMethod", 0] } }, 2] }, 
                  { $toDouble: { $ifNull: ["$profit", 0] } }, 
                  0
                ]
              }
            }
          }
        }
      ]);

      if (totalsAggregation.length > 0) {
        totals = {
          totalRevenue: totalsAggregation[0].totalRevenue || 0,
          totalExtraFee: totalsAggregation[0].totalExtraFee || 0,
          totalProfit: totalsAggregation[0].totalProfit || 0,
          totalCash: totalsAggregation[0].totalCash || 0,
          totalTransfer: totalsAggregation[0].totalTransfer || 0,
        };
      }
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
