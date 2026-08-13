// models/SuperAdmin.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const superAdminSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role:     { type: String, enum: ["superadmin", "support"], default: "superadmin" },
    isActive: { type: Boolean, default: true },
    lastLogin:{ type: Date },
  },
  { timestamps: true }
);

// Hash password before save
superAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
superAdminSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

export const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);
