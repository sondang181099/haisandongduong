import mongoose, { Schema, type Document } from "mongoose";

export interface IRole extends Document {
  name: string;
  key: string;
  description?: string;
  permissions: string[]; // List of menu paths or IDs
  viewUnpaid?: boolean; // Can view unpaid invoices
  isSystem?: boolean; // System roles cannot be deleted
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String },
    permissions: { type: [String], default: [] },
    viewUnpaid: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Role = mongoose.models.Role || mongoose.model<IRole>("Role", RoleSchema);
