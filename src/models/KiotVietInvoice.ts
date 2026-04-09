import mongoose, { Schema, type Document } from "mongoose";

export interface IKiotVietInvoice extends Document {
  invoiceCode: string; // Mã hóa đơn (HD...)
  rawData: any; // Toàn bộ JSON từ API KiotViet
  syncedToTransaction: boolean; // Trạng thái đã đẩy sang bảng Transaction chưa
  createdAt: Date;
  updatedAt: Date;
}

const KiotVietInvoiceSchema = new Schema<IKiotVietInvoice>(
  {
    invoiceCode: { type: String, required: true, unique: true, index: true },
    rawData: { type: Schema.Types.Mixed, required: true },
    syncedToTransaction: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const KiotVietInvoice =
  mongoose.models.KiotVietInvoice ||
  mongoose.model<IKiotVietInvoice>("KiotVietInvoice", KiotVietInvoiceSchema);
