import mongoose, { Schema, Document } from "mongoose";

export interface ISpecialRule {
  condition: {
    type: "lt" | "gt" | "range";
    value: number;
    maxValue?: number;
  };
  action: {
    type: "fixed" | "percent" | "add";
    value: number;
  };
}

export interface IRevenueConfig extends Document {
  vehicleType: string;
  defaultFormula: string;
  specialRules: ISpecialRule[];
  updatedAt: Date;
}

const RevenueConfigSchema: Schema = new Schema(
  {
    vehicleType: { type: String, required: true, unique: true },
    defaultFormula: { type: String, default: "R * 0" },
    specialRules: [
      {
        condition: {
          type: { type: String, enum: ["lt", "gt", "range"], required: true },
          value: { type: Number, required: true },
          maxValue: { type: Number },
        },
        action: {
          type: { type: String, enum: ["fixed", "percent", "add"], required: true },
          value: { type: Number, required: true },
        },
      },
    ],
  },
  { timestamps: true }
);

export const RevenueConfig = mongoose.models.RevenueConfig || mongoose.model<IRevenueConfig>("RevenueConfig", RevenueConfigSchema);
