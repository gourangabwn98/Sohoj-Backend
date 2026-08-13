# DAB — Dokan in a Box (Backend v2)

Super admin backend that manages multiple restaurant deployments.
Each restaurant gets its own MongoDB database with all 7 collections pre-created.

---

## What gets created when you add a restaurant

When you call `POST /api/restaurants`, DAB automatically:

1. Creates a new MongoDB database: `<restaurant_name>_db`
2. Seeds all 7 collections with correct schemas:

| Collection          | Seeded with |
|--------------------|-------------|
| `users`            | Admin user (email + hashed password) |
| `restaurantprofiles` | Restaurant name, contact, city |
| `categories`       | 5 default: Starters, Main Course, Beverages, Desserts, Breads |
| `chefs`            | Empty (ready to use) |
| `menuitems`        | Empty (ready to use) |
| `orders`           | Empty (ready to use) |
| `tables`           | Empty (ready to use) |
| `invoices`         | Empty (ready to use) |

3. Returns credentials (mongoUri, apiKey, adminEmail/password)

---

## Quick Start

```bash
npm install
# Fill in .env
npm run dev
```

Default super admin auto-created on first start.

---

## Environment Variables

| Key | Required | Description |
|-----|----------|-------------|
| `DAB_MONGO_URI` | ✅ | MongoDB URI for dab_master (control plane) |
| `ATLAS_BASE_URI` | ✅ | Base MongoDB URI without DB name (for provisioning) |
| `DAB_JWT_SECRET` | ✅ | JWT signing secret |
| `SUPER_ADMIN_EMAIL` | ✅ | First super admin login |
| `SUPER_ADMIN_PASSWORD` | ✅ | First super admin password |

### ATLAS_BASE_URI format:
```
mongodb+srv://username:password@cluster0.abc123.mongodb.net
```
No database name at the end — DAB appends it automatically for each restaurant.

---

## API Reference

### Auth
```
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/change-password
```

### Plans
```
GET    /api/plans
POST   /api/plans
PUT    /api/plans/:id
DELETE /api/plans/:id
```

### Restaurants
```
GET    /api/restaurants
POST   /api/restaurants        ← provisions new DB automatically
GET    /api/restaurants/:slug
PUT    /api/restaurants/:slug
DELETE /api/restaurants/:slug

PATCH  /api/restaurants/:slug/status
PATCH  /api/restaurants/:slug/plan
PATCH  /api/restaurants/:slug/regenerate-key
GET    /api/restaurants/:slug/stats        ← pulls live data from restaurant DB
GET    /api/restaurants/:slug/credentials
```

### Verify (called by restaurant servers)
```
GET /api/verify                   Header: x-dab-api-key: <key>
GET /api/verify/check/:slug
GET /api/verify/global-stats
```

### Audit Logs
```
GET /api/audit-logs
```

---

## Creating a New Restaurant

```json
POST /api/restaurants
{
  "name":          "Kolhad Cafe",
  "planId":        "<plan_id>",
  "adminEmail":    "admin@kolhad.com",
  "adminPassword": "SecurePass123",
  "ownerName":     "Ravi Kumar",
  "ownerPhone":    "9876543210",
  "city":          "Kolkata"
}
```

Response includes ready-to-use credentials:
```json
{
  "credentials": {
    "adminEmail":  "admin@kolhad.com",
    "adminPassword": "SecurePass123",
    "apiKey":      "dab_abc123...",
    "dbName":      "kolhad_cafe_db",
    "mongoUri":    "mongodb+srv://...kolhad_cafe_db"
  }
}
```

Add to the restaurant server's `.env`:
```env
MONGO_URI=<mongoUri from credentials>
DAB_API_URL=https://your-dab-server.com
DAB_API_KEY=<apiKey from credentials>
```

---

## DB Schema per Restaurant

```
kolhad_cafe_db
├── users              ← admin + waiter + customer accounts
├── restaurantprofiles ← restaurant settings (GST, services, logo)
├── categories         ← menu categories
├── chefs              ← kitchen staff
├── menuitems          ← menu items with prices
├── orders             ← all orders
├── tables             ← table config + QR codes
└── invoices           ← generated bills
```

---

## Plans

| Plan     | Price    | Tables | Waiters | Analytics | KOT |
|----------|----------|--------|---------|-----------|-----|
| Manual   | Free     | 5      | 1       | ❌        | ❌  |
| Pro      | ₹999/mo  | 20     | 5       | ✅        | ✅  |
| Pro Plus | ₹2499/mo | ∞      | ∞       | ✅        | ✅  |
