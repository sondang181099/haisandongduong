import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  password: string;
  fullname: string;
  role: string;
  identity?: string;
  cars?: Array<{
    licensePlate: string;
    brands?: string[];
    [key: string]: any;
  } | string>;
  payment?: {
    bankBin?: string;
    bankShortName?: string;
    accountNumber?: string;
    accountName?: string;
    [key: string]: any;
  };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    fullname: { type: String, required: true },
    role: {
      type: String,
      default: "Tài xế",
    },
    identity: { type: String },
    cars: { type: [Schema.Types.Mixed], default: [] },
    payment: {
      bankBin: { type: String, default: "" },
      bankShortName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      accountName: { type: String, default: "" },
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
