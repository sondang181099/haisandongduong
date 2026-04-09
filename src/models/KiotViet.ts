import mongoose, { Schema, type Document } from "mongoose";

export interface IKiotViet extends Document {
  key: string;
  accessToken: string;
  createdAt: Date;
  updatedAt: Date;
}

const KiotVietSchema = new Schema<IKiotViet>(
  {
    key: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
  },
  { timestamps: true }
);

export const KiotViet =
  mongoose.models.KiotViet || mongoose.model<IKiotViet>("KiotViet", KiotVietSchema);
