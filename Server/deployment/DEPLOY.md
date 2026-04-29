# Deployment Guide: Supabase + Render

## Overview
- Database + Storage: Supabase (PostgreSQL + Storage)
- Backend (FastAPI): Render (free tier)
- Admin Dashboard: Vercel
- Client App: Vercel

---

## STEP 1 — Set Up Supabase

### 1.1 Create Project
1. Go to https://supabase.com → Sign in → New Project
2. Choose a name (e.g. `amudhu`), set a strong DB password, pick region closest to India (ap-south-1)
3. Wait ~2 minutes for project to be ready

### 1.2 Run the SQL Schema
1. In Supabase Dashboard → **SQL Editor** → **New Query**
2. Copy the entire contents of `Server/deployment/supabase_schema.sql`
3. Paste and click **Run**
4. You should see all 15 tables created

### 1.3 Create Storage Bucket
1. Go to **Storage** → **New Bucket**
2. Name: `product-images`
3. Check **Public bucket** (so product images are publicly accessible)
4. Click **Save**

### 1.4 Get Your Credentials
Go to **Settings** → **API**:
- Copy **Project URL** → this is `SUPABASE_URL`
- Copy **service_role** key → this is `SUPABASE_SERVICE_ROLE_KEY`

Go to **Settings** → **Database** → **Connection string** → **URI**:
- Copy the **Transaction pooler** URI (port 6543) → this is `DATABASE_URL`
- Replace `[YOUR-PASSWORD]` with the DB password you set

---

## STEP 2 — Deploy Backend on Render

### 2.1 Prepare the Repo
Make sure your code is pushed to GitHub.

Create `Server/render.yaml` (already done if using Render's Blueprint):

### 2.2 Deploy on Render
1. Go to https://render.com → New → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `Server`
   - **Build Command**: `pip install uv && uv sync`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Python version**: 3.11

### 2.3 Add Environment Variables in Render
Under **Environment** tab, add all variables from `Server/.env.example`:

```
APP_NAME=E-Commerce Admin Backend
DEBUG=False
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=product-images
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
CORS_ORIGINS=https://your-admin.vercel.app,https://your-client.vercel.app
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
CLIENT_URL=https://your-client.vercel.app
```

### 2.4 Note Your Backend URL
After deploy, Render gives you a URL like:
`https://amudhu-api.onrender.com`

---

## STEP 3 — Deploy Admin Dashboard on Vercel

```bash
cd Admin
# Install Vercel CLI if needed
npm install -g vercel

# Deploy
vercel --prod
```

When prompted:
- Framework: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

Add environment variable in Vercel Dashboard:
```
VITE_API_BASE_URL=https://amudhu-api.onrender.com/api/v1
```

---

## STEP 4 — Deploy Client App on Vercel

```bash
cd Client
vercel --prod
```

Same as Admin — add:
```
VITE_API_BASE_URL=https://amudhu-api.onrender.com/api/v1
```

---

## STEP 5 — Update CORS

Once you have the Vercel URLs, go back to **Render** → **Environment** and update:
```
CORS_ORIGINS=https://your-admin.vercel.app,https://your-client.vercel.app
```

Then redeploy the backend.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                      Supabase                           │
│  ┌─────────────────┐   ┌──────────────────────────┐    │
│  │  PostgreSQL DB   │   │   Storage (product-imgs) │    │
│  │  (15 tables)    │   │   (public bucket)        │    │
│  └─────────────────┘   └──────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
            ▲                         ▲
            │ SQLAlchemy              │ supabase-py
            │                        │
┌───────────────────────────────────────────────────────┐
│                FastAPI Backend (Render)               │
│  - All 15 REST API endpoints                         │
│  - Razorpay payment integration                      │
│  - Auth (OTP + Password)                             │
└───────────────────────────────────────────────────────┘
            ▲                         ▲
      HTTPS API calls           HTTPS API calls
            │                         │
┌──────────────────┐       ┌────────────────────┐
│  Admin Dashboard │       │    Client App      │
│  (Vercel/React)  │       │  (Vercel/React)    │
└──────────────────┘       └────────────────────┘
```

---

## Quick Test After Deployment

```bash
# Health check
curl https://amudhu-api.onrender.com/api/v1/health

# List products
curl https://amudhu-api.onrender.com/api/v1/products

# Get site config
curl https://amudhu-api.onrender.com/api/v1/site-config
```

---

## Notes

- **Free tier limits**: Render free tier sleeps after 15 min of inactivity (cold start ~30s). Upgrade to Starter ($7/mo) for always-on.
- **Supabase free tier**: 500MB DB, 1GB Storage, 2GB bandwidth — plenty for starting out.
- **Images**: Product images are now stored in Supabase Storage and served via public CDN URL. The `image_url` field in the product API response will point to the Supabase Storage URL.
