// utils/provision.js
// ─────────────────────────────────────────────────────────────────────────────
// Provisions a new restaurant database with ALL 7 collections:
//   users, restaurantprofiles, categories, chefs,
//   menuitems, orders, tables, invoices
// Mirrors the exact schemas from the restaurant server.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 }                        from "uuid";
import mongoose                                  from "mongoose";
import bcrypt                                    from "bcryptjs";
import { getRestaurantDB, buildRestaurantURI }   from "../config/db.js";

// ── Name helpers ──────────────────────────────────────────────────────────────
export const buildDbName = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
      .replace(/^_|_$/g, "").slice(0, 38) + "_db";

export const buildSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")
      .replace(/^-|-$/g, "").slice(0, 50);

export const generateApiKey = () =>
  `dab_${uuidv4().replace(/-/g, "")}_${Date.now()}`;

// ── Schema definitions (exact copies of restaurant server models) ─────────────

const UserSchema = new mongoose.Schema({
  name:       { type: String, trim: true },
  phone:      { type: String, unique: true, trim: true },
  email:      { type: String, unique: true, sparse: true, lowercase: true },
  password:   { type: String },
  otp:        { type: String },
  otpExpiry:  { type: Date },
  isVerified: { type: Boolean, default: false },
  vegMode:    { type: Boolean, default: false },
  language:   { type: String, default: "English" },
  isAdmin:    { type: Boolean, default: false },
  role:       { type: String, enum: ["admin", "waiter", "customer"], default: "customer" },
  waiterName: { type: String },
}, { timestamps: true });

const RestaurantProfileSchema = new mongoose.Schema({
  restaurantName:    { type: String, required: true, trim: true },
  phone:             { type: String, trim: true, default: "" },
  email:             { type: String, trim: true, lowercase: true, default: "" },
  contactPerson:     { type: String, trim: true, default: "" },
  gstRate:           { type: Number, default: 0 },
  serviceCharge:     { type: Number, default: 0 },
  packingCharge:     { type: Number, default: 0 },
  logo:              { type: String, default: "" },
  banners:           [{
    imageUrl: { type: String, default: "" },
    link:     { type: String, default: "" },
    active:   { type: Boolean, default: true },
  }],
  printerIps:        [{
    ip:     { type: String, default: "" },
    name:   { type: String, default: "Printer 1" },
    active: { type: Boolean, default: true },
  }],
  address:           { type: String, default: "" },
  city:              { type: String, default: "" },
  latitude:          { type: Number, default: null },
  longitude:         { type: Number, default: null },
  dineInRange:       { type: Number, default: 200 },
  deliveryRange:     { type: Number, default: 5000 },
  fssaiNumber:       { type: String, default: "" },
  gstNumber:         { type: String, default: "" },
  aboutRestaurant:   { type: String, default: "" },
  openingTime:       { type: String, default: "09:00" },
  closingTime:       { type: String, default: "22:00" },
  avgDeliveryTime:   { type: Number, default: 30 },
  minOrderAmount:    { type: Number, default: 0 },
  freeDeliveryAbove: { type: Number, default: 300 },
  deliveryBaseFee:   { type: Number, default: 40 },
  deliveryFeePerKm:  { type: Number, default: 8 },
  socialInstagram:   { type: String, default: "" },
  socialFacebook:    { type: String, default: "" },
  website:           { type: String, default: "" },
  services: {
    dineIn:   { type: Boolean, default: true },
    takeAway: { type: Boolean, default: true },
    delivery: { type: Boolean, default: false },
  },
  notificationSound: { type: Boolean, default: true },
}, { timestamps: true });

const CategorySchema = new mongoose.Schema({
  name:  { type: String, required: true, unique: true, trim: true },
  image: { type: String, default: "" },
}, { timestamps: true });

const ChefSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  phone:     { type: String, required: true, unique: true },
  status:    { type: String, enum: ["Active", "Inactive"], default: "Active" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
}, { timestamps: true });

const MenuItemSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  price:         { type: Number, required: true },
  originalPrice: { type: Number },
  description:   { type: String },
  category:      { type: String, required: true },
  categoryImage: { type: String, default: "" },
  tag:           { type: String, enum: ["Veg", "Non Veg"], required: true },
  image:         { type: String, default: "" },
  isAvailable:   { type: Boolean, default: true },
  rating:        { type: Number, default: 4.0 },
}, { timestamps: true });

const OrderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  qty:      { type: Number, required: true, min: 1 },
  notes:    { type: String, default: "" },
});

const OrderSchema = new mongoose.Schema({
  orderId:       { type: String, unique: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  isGuest:       { type: Boolean, default: false },
  items:         [OrderItemSchema],
  subtotal:      { type: Number, required: true },
  tax:           { type: Number, required: true },
  serviceCharge: { type: Number, default: 0 },
  discount:      { type: Number, default: 0 },
  total:         { type: Number, required: true },
  orderType:     { type: String, enum: ["Dining", "Take Away", "Delivery"], default: "Dining" },
  tableNo:       { type: Number, default: null },
  status: {
    type: String,
    enum: ["PendingApproval", "Placed", "Preparing", "Ready", "Delivered", "Completed", "Cancelled"],
    default: "Placed",
  },
  paymentStatus:  { type: String, enum: ["Pending", "Paid", "Failed"], default: "Pending" },
  paymentMethod:  { type: String, enum: ["Cash", "Online"], default: "Cash" },
  rating:         { type: Number, min: 1, max: 5 },
  cancelDeadline: { type: Date },
  notes:          { type: String, default: "" },
  waiterName:     { type: String, default: "" },
}, { timestamps: true });

// Auto-generate orderId
OrderSchema.pre("save", async function () {
  if (!this.orderId) {
    const count = await this.constructor.countDocuments();
    const prefix = "ORD";
    this.orderId = `${prefix}${String(count + 1).padStart(5, "0")}`;
  }
});

const TableSchema = new mongoose.Schema({
  tableNo: { type: Number, required: true, unique: true },
  seats:   { type: Number, required: true, default: 4 },
  status:  { type: String, enum: ["Active", "Inactive"], default: "Active" },
  label:   { type: String },
  notes:   { type: String },
  qrUrl:   { type: String },
  qrCode:  { type: String },
}, { timestamps: true });

const InvoiceSchema = new mongoose.Schema({
  orders:        [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  orderId:       String,
  user:          { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  isGuest:       { type: Boolean, default: false },
  orderType:     { type: String, default: "Dining" },
  subtotal:      { type: Number, required: true },
  tax:           { type: Number, required: true },
  serviceCharge: { type: Number, default: 0 },
  total:         { type: Number, required: true },
  items:         [{ name: String, price: Number, qty: Number }],
  tableNo:       { type: Number, default: null },
  status: {
    type: String,
    enum: ["pending", "completed", "paid", "cancelled", "refunded"],
    default: "pending",
  },
  paymentStatus:  { type: String, enum: ["Pending", "Paid", "Failed"], default: "Pending" },
  paymentMethod:  { type: String, enum: ["Cash", "Online"], default: "Cash" },
  generatedAt:    { type: Date, default: Date.now },
  notes:          { type: String, default: "" },
}, { timestamps: true });

// ── Register models on a connection ───────────────────────────────────────────
function registerModels(conn) {
  return {
    User:              conn.models.User              || conn.model("User",              UserSchema),
    RestaurantProfile: conn.models.RestaurantProfile || conn.model("RestaurantProfile", RestaurantProfileSchema),
    Category:          conn.models.Category          || conn.model("Category",          CategorySchema),
    Chef:              conn.models.Chef              || conn.model("Chef",              ChefSchema),
    MenuItem:          conn.models.MenuItem          || conn.model("MenuItem",          MenuItemSchema),
    Order:             conn.models.Order             || conn.model("Order",             OrderSchema),
    Table:             conn.models.Table             || conn.model("Table",             TableSchema),
    Invoice:           conn.models.Invoice           || conn.model("Invoice",           InvoiceSchema),
  };
}

// ── Default seed data ─────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name: "Starters",    image: "🍢" },
  { name: "Main Course", image: "🍛" },
  { name: "Beverages",   image: "🥤" },
  { name: "Desserts",    image: "🍰" },
  { name: "Breads",      image: "🫓" },
];

// ── Main provision function ───────────────────────────────────────────────────
export const provisionRestaurant = async ({
  name,
  ownerName,
  ownerEmail,
  ownerPhone,
  city,
  adminEmail,
  adminPasswordPlain,
}) => {
  const dbName   = buildDbName(name);
  const mongoUri = buildRestaurantURI(dbName);
  const apiKey   = generateApiKey();

  // ── 1. Connect to the new DB ──────────────────────────────────────────────
  const conn = await getRestaurantDB(mongoUri, dbName);

  // ── 2. Register all 8 models on this connection ───────────────────────────
  const {
    User, RestaurantProfile, Category, Chef,
    MenuItem, Order, Table, Invoice,
  } = registerModels(conn);

  // ── 3. Seed: Restaurant Profile ───────────────────────────────────────────
  const profileExists = await RestaurantProfile.findOne();
  if (!profileExists) {
    await RestaurantProfile.create({
      restaurantName: name,
      contactPerson:  ownerName  || "",
      email:          ownerEmail || "",
      phone:          ownerPhone || "",
      city:           city       || "",
      services: { dineIn: true, takeAway: true, delivery: false },
    });
    console.log(`  ✅ [${dbName}] RestaurantProfile seeded`);
  }

  // ── 4. Seed: Admin User ───────────────────────────────────────────────────
  if (adminEmail && adminPasswordPlain) {
    const exists = await User.findOne({ email: adminEmail });
    if (!exists) {
      const hashed = await bcrypt.hash(adminPasswordPlain, 12);
      await User.create({
        name:       ownerName || "Admin",
        email:      adminEmail,
        phone:      ownerPhone || `admin_${Date.now()}`,
        password:   hashed,
        isAdmin:    true,
        isVerified: true,
        role:       "admin",
      });
      console.log(`  ✅ [${dbName}] Admin user created: ${adminEmail}`);
    }
  }

  // ── 5. Seed: Default Categories ───────────────────────────────────────────
  const catCount = await Category.countDocuments();
  if (catCount === 0) {
    await Category.insertMany(DEFAULT_CATEGORIES);
    console.log(`  ✅ [${dbName}] ${DEFAULT_CATEGORIES.length} categories seeded`);
  }

  // ── 6. Ensure empty collections exist (touch each model) ─────────────────
  // MongoDB creates a collection only on first write.
  // We touch each collection so it appears in Atlas from day 1.
  const collections = [
    { model: Chef,     name: "chefs" },
    { model: MenuItem, name: "menuitems" },
    { model: Order,    name: "orders" },
    { model: Table,    name: "tables" },
    { model: Invoice,  name: "invoices" },
  ];

  for (const { model, name: colName } of collections) {
    const count = await model.countDocuments();
    if (count === 0) {
      // Create and immediately delete a placeholder to initialise the collection
      const doc = await model.create(getPlaceholder(colName));
      await model.deleteOne({ _id: doc._id });
      console.log(`  ✅ [${dbName}] Collection '${colName}' initialised`);
    }
  }

  console.log(`🎉 Restaurant "${name}" provisioned → DB: ${dbName}`);
  return { dbName, mongoUri, apiKey };
};

// ── Minimal valid placeholder per collection ──────────────────────────────────
function getPlaceholder(colName) {
  const ts = Date.now();
  switch (colName) {
    case "chefs":
      return { name: "__placeholder__", phone: String(ts).slice(-10), status: "Inactive" };
    case "menuitems":
      return { name: "__placeholder__", price: 0, category: "Uncategorized", tag: "Veg" };
    case "orders":
      return {
        subtotal: 0, tax: 0, total: 0,
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: "__placeholder__", price: 0, qty: 1 }],
        status: "Cancelled",
      };
    case "tables":
      return { tableNo: 99999, seats: 0, status: "Inactive" };
    case "invoices":
      return { subtotal: 0, tax: 0, total: 0, status: "cancelled" };
    default:
      return {};
  }
}
