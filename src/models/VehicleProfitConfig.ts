import mongoose, { Schema, Document } from "mongoose";

export interface IVehicleProfitConfig extends Document {
  id: string; // ID possibly from older system mapping
  name: string; // The vehicle type, e.g. "Xe điện"
  config: {
    formula: string;
    conditions: {
      type: "less_than" | "greater_than" | "range";
      values: number[];
      action: {
        type: "fixed_result" | "percent_result" | "bonus_amount";
        value: number;
      };
    }[];
  };
  rounding?: {
    type: string;
    step: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const VehicleProfitConfigSchema: Schema = new Schema(
  {
    id: { type: String },
    name: { type: String, required: true },
    config: {
      formula: { type: String, default: "R * 0" },
      conditions: [
        {
          type: { type: String, enum: ["less_than", "greater_than", "range"], required: true },
          values: [{ type: Number }],
          action: {
            type: { type: String, enum: ["fixed_result", "percent_result", "bonus_amount"], required: true },
            value: { type: Number, required: true },
          },
        },
      ],
    },
    rounding: {
      type: { type: String, default: "nearest" },
      step: { type: Number, default: 1000 },
    },
  },
  { timestamps: true, collection: "vehicle_profit_configs", strict: false }
);

// Clear the model from cache to ensure schema updates are applied in development
if (mongoose.models.VehicleProfitConfig) {
  delete mongoose.models.VehicleProfitConfig;
}

export const VehicleProfitConfig = mongoose.model<IVehicleProfitConfig>("VehicleProfitConfig", VehicleProfitConfigSchema);
