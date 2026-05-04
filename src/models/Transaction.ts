import mongoose, { Schema, type Document } from "mongoose";

export interface ITransaction extends Document {
  code: string; // Mã đoàn (thường là customerCode của KiotViet)
  invoiceCode?: string; // Mã hóa đơn thực tế để tránh trùng lặp
  licensePlate?: string; // Giữ lại dự phòng (Legacy)
  vehicleNumber: string; // Tên chuẩn mới
  groups: string; // Loại xe/Nhóm xe
  revenue: number; // Doanh thu
  profit: number; // Lợi nhuận/Hoa hồng
  extraFee: number; // Các khoản phát sinh (Legacy)
  extraRevenue: number; // Các khoản phát sinh (Chuẩn mới)
  status: number; // 1: Đã thanh toán, 0: Chưa thanh toán
  paymentMethod: any; // Chấp nhận mọi giá trị để tránh lỗi validation vô lý
  paidDateAt?: Date; // Ngày thanh toán thực tế
  paidBy?: string; // Người chi/Người thanh toán
  updatedBy?: string; // Nhân viên cập nhật cuối
  sellerName?: string; // Tên nhân viên Sale phụ trách chốt đơn
  arrivalDate?: Date; // Ngày đoàn đến (Legacy)
  customerModifiedDate?: Date; // Ngày đến (Chuẩn hệ thống cũ)
  customerId?: number; // ID số từ KiotViet
  brands?: string[]; // Mảng các loại xe/nhóm xe
  isCustomerDeleted?: boolean; // Khách hàng đã bị xóa trên KiotViet
  isHidden?: boolean; // Khách hàng bị ẩn cục bộ (không hiển thị trên bảng)
  isRevenueChanged?: boolean; // Doanh thu có thay đổi so với gốc
  syncSource?: string; // Nguồn đồng bộ (KiotViet, v.v.)
  childInvoices?: {
    code: string;
    purchaseDate: Date;
    soldByName: string;
    total: number;
    mainProducts: string;
  }[];
  user?: any; // Thông tin người dùng (liên kết hệ thống)
  revenueAtPayment?: number; // Doanh thu tại thời điểm thanh toán
  reducedRevenueAtPayment?: number; // Doanh thu ĐÃ GIẢM tại thời điểm thanh toán
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    code: { type: String, required: true, index: true },
    invoiceCode: { type: String, sparse: true, index: true },
    licensePlate: { type: String },
    vehicleNumber: { type: String, required: true, index: true },
    groups: { type: String, default: "" },
    revenue: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    extraFee: { type: Number, default: 0 },
    extraRevenue: { type: Number, default: 0 },
    status: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: Schema.Types.Mixed,
      default: 0,
    },
    paidDateAt: { type: Date },
    paidBy: { type: String },
    updatedBy: { type: String },
    sellerName: { type: String },
    arrivalDate: { type: Date },
    customerModifiedDate: { type: Date },
    customerId: { type: Number },
    brands: { type: [String], default: [] },
    isCustomerDeleted: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    isRevenueChanged: { type: Boolean, default: false },
    syncSource: { type: String, index: true },
    childInvoices: [
      {
        code: { type: String },
        purchaseDate: { type: Date },
        soldByName: { type: String },
        total: { type: Number },
        mainProducts: { type: String },
      },
    ],
    user: { type: mongoose.Schema.Types.Mixed },
    revenueAtPayment: { type: Number },
    reducedRevenueAtPayment: { type: Number },
  },
  { timestamps: true }
);

export const Transaction =
  mongoose.models.TransactionV3 ||
  mongoose.model<ITransaction>("TransactionV3", TransactionSchema, "transactions");
