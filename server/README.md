# Forms Server

This server receives form submissions, uploads images to Supabase Storage, and saves the submission row in the Supabase database.

## Setup

1. Create a Supabase project.
2. Create a public Storage bucket named `order-submissions`.
3. Run [migrations/001_create_order_submissions.sql](migrations/001_create_order_submissions.sql) in the Supabase SQL editor. It creates the table if it doesn't exist yet, and safely backfills the `orderId`, `submission_reference`, and `status` columns on existing tables.

4. Add these env vars in `server/.env`:

```bash
PORT=3000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_TABLE=order_submissions
SUPABASE_BUCKET=order-submissions
```

If your existing table is `wiz_order`, rename it to match `SUPABASE_TABLE` (or update the env var), then run the migration above to add the missing columns.

5. Install dependencies and start the server:

```bash
cd server
npm install
npm start
```

## Project structure

```
server/
  index.js                  # Express app bootstrap (middleware, routes, startup)
  migrations/                # SQL migrations to run in the Supabase SQL editor
  src/
    config.js               # Env vars and shared constants
    lib/supabaseClient.js    # Supabase client instance
    middleware/              # Rate limiter + centralized error handler
    routes/                  # Express routers (submissions, storage)
    services/                # Business logic (storage uploads, submissions)
    utils/                   # Text helpers and file signature checks
    validators/               # Request validation for submissions
```

## APIs

- `POST /api/submissions`
  - Multipart form data
  - Fields: `name`, `phone`, `address`, `city`, `pincode`, `productName`, `advanceAmount`, `terms`
  - Files: up to 5 `productImage` files and an optional `receiptImage` file
  - Uploads the first product image and, when provided, the receipt to Supabase Storage and inserts the generated `orderId` into Supabase Database

- `GET /api/submissions?page=1&limit=20&fromDate=...&toDate=...`
  - Returns paginated rows ordered by newest first
  - `fromDate` and `toDate` accept ISO datetime values
  - `limit` is capped at 100

- `GET /api/submissions/:submissionReference`
  - Returns a single submission by reference

- `GET /api/storage/public-url?path=...`
  - Resolves a Supabase bucket object path into its public image URL
  - You can also pass `url=...` to echo an existing public URL

- `GET /api/health`
  - Basic server health check
