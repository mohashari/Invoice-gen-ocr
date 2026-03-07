# Invoice Generator with OCR

A full-stack web application that extracts structured data from scanned invoices using Tesseract 5 OCR, enables manual correction, and generates clean digital PDF invoices — fully containerized with Docker Compose.

![Architecture](https://img.shields.io/badge/stack-React%20%7C%20Node.js%20%7C%20Python%20%7C%20Tesseract5-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [OCR Pipeline](#ocr-pipeline)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Default Credentials](#default-credentials)
- [Port Mapping](#port-mapping)
- [Role-Based Access Control](#role-based-access-control)
- [Kubernetes Deployment](#kubernetes-deployment)
- [CI/CD](#cicd)

---

## Features

- **Drag & drop file upload** — PNG, JPG, TIFF, and PDF (up to 20 MB)
- **Async OCR processing** — Tesseract 5 LSTM engine with OpenCV preprocessing pipeline
- **Structured field extraction** — invoice number, dates, vendor, line items, totals, tax
- **Indonesian number format** — dot-separated thousands (e.g. `17.100.000` → `17100000`)
- **Multi-PSM confidence scoring** — tries PSM 3, 6, 11; selects highest confidence result
- **Manual correction UI** — edit any extracted field before confirming
- **PDF generation** — Puppeteer-rendered PDF from Handlebars template, stored in MinIO/S3
- **Real-time status** — Server-Sent Events (SSE) stream for OCR job progress
- **Role-based access control** — Admin, Accountant, Viewer roles
- **JWT authentication** — 15-min access token + 7-day refresh token (httpOnly cookie)
- **Paginated invoice list** with search and status filter
- **MinIO** for local file storage (drop-in AWS S3 compatible for production)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, React Query |
| Backend API | Node.js 20, Fastify v4, Prisma ORM, BullMQ |
| OCR Worker | Python 3.11, Tesseract 5 (LSTM `--oem 1`), OpenCV, pytesseract, pdf2image |
| Queue | Redis 7 + BullMQ |
| Database | PostgreSQL 16 |
| File Storage | MinIO (dev) / AWS S3 (prod) |
| PDF Engine | Puppeteer + Handlebars |
| Auth | JWT + bcrypt |
| Proxy | Nginx 1.25 |
| Containers | Docker + Docker Compose |
| Orchestration | Kubernetes (production) |
| CI/CD | GitHub Actions |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                          │
│                     React + TypeScript + Vite                      │
│         Upload UI | Invoice Editor | Dashboard | PDF Preview       │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTP / REST + SSE
┌──────────────────────────────▼─────────────────────────────────────┐
│                         Nginx (port 80)                            │
│              Reverse proxy + rate limiting                         │
│   /api/*  →  Backend API   |   /*  →  Frontend (Vite)             │
└────────┬──────────────────────────────────────────┬────────────────┘
         │                                          │
┌────────▼────────────┐                  ┌──────────▼──────────────┐
│   Backend API       │                  │    OCR Worker           │
│   Node.js + Fastify │◄──── Redis  ────►│    Python 3.11          │
│   (REST + Auth)     │   BullMQ Queue   │    Tesseract 5 LSTM     │
└────────┬────────────┘                  └──────────┬──────────────┘
         │                                          │
┌────────▼────────────────────────────────────────▼──────────────────┐
│                          Data Layer                                │
│  PostgreSQL 16 (structured)  │  Redis 7 (queue)  │  MinIO (files) │
└────────────────────────────────────────────────────────────────────┘
```

**Request flow:**
1. User uploads invoice → stored in MinIO, OCR job enqueued via BullMQ
2. Python worker picks up job, preprocesses image, runs Tesseract 5
3. Extracted fields sent via HTTP callback to API → saved in PostgreSQL
4. Frontend receives status via SSE, shows extracted fields for review
5. User corrects data → triggers PDF generation → stored in MinIO

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full design and ADRs.

---

## Project Structure

```
invoice-gen-ocr/
├── ARCHITECTURE.md              # Architecture decisions and ADRs
├── PLAN.md                      # Sprint plan
├── docker-compose.yml           # 7-service stack
├── .env.example                 # Environment variable template
│
├── frontend/                    # React 18 + Vite + Tailwind CSS
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── UploadPage.tsx        # Drag & drop + SSE status stream
│       │   ├── InvoicesPage.tsx      # Paginated list with filters
│       │   ├── InvoiceEditPage.tsx   # Field editor + confidence indicators
│       │   └── InvoicePreviewPage.tsx
│       ├── components/
│       ├── stores/               # Zustand global state
│       └── hooks/                # React Query server-state hooks
│
├── backend/                     # Node.js 20 + Fastify
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts           # Login, refresh, logout
│   │   │   ├── invoices.ts       # CRUD, upload, PDF, SSE
│   │   │   ├── users.ts          # User management (admin only)
│   │   │   └── internal.ts       # OCR callback (internal)
│   │   ├── services/
│   │   │   ├── invoice.service.ts
│   │   │   └── pdf.service.ts    # Puppeteer + Handlebars
│   │   └── utils/
│   │       ├── db.ts             # Prisma client
│   │       ├── queue.ts          # BullMQ producer
│   │       └── s3.ts             # MinIO/S3 client
│   └── prisma/schema.prisma
│
├── ocr-worker/                  # Python 3.11
│   └── app/
│       ├── worker.py             # Redis queue consumer (lmove polling)
│       └── pipeline/
│           ├── preprocess.py     # OpenCV preprocessing pipeline
│           ├── ocr.py            # Tesseract 5 multi-PSM with scoring
│           └── extract.py        # Regex field extractor (EN + ID)
│
├── nginx/nginx.conf
└── infra/k8s/                   # Kubernetes manifests
    ├── api-deployment.yaml       # 3 replicas + HPA
    ├── ocr-worker-deployment.yaml # 2 replicas + HPA
    ├── postgres-statefulset.yaml
    ├── redis-statefulset.yaml
    └── ingress.yaml
```

---

## OCR Pipeline

```
Raw File (MinIO)
    │
    ▼ 1. PREPROCESSING (OpenCV)
    ├── Grayscale conversion
    ├── Deskew  — HoughLinesP detects skew in -15°..+15° range
    ├── Denoise — fastNlMeansDenoising (h=10, templateWindow=7)
    ├── Contrast — CLAHE (clipLimit=2.0, tileGrid=8×8)
    └── Binarize — Adaptive Gaussian threshold (blockSize=11)
    │
    ▼ 2. OCR (Tesseract 5 LSTM)
    ├── --oem 1 (LSTM neural network only)
    ├── Languages: eng + ind
    └── Tries PSM 3 / 6 / 11 — picks highest mean word confidence
    │
    ▼ 3. FIELD EXTRACTION (Regex + heuristics)
    ├── Invoice number   NV-2026-001 style (letter-prefixed)
    ├── Dates            DD MonthName YYYY, YYYY-MM-DD, DD/MM/YYYY (EN + ID)
    ├── Amounts          IDR prefix + dot-thousand separators (1.881.000 → 1881000)
    ├── Tax amount       Requires formatted number — skips percentage-only values
    ├── Total amount     Prefers "Total Amount" / "Grand Total" over bare "Total"
    ├── Payment terms    Handles "Payment TermsNet 30" (missing separator)
    └── Line items       Pipe-separated or multi-space tabular rows
    │
    ▼ 4. CALLBACK → API → PostgreSQL
```

**Achieved accuracy:** ~94% confidence on clean scanned invoices.

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- Git

### Clone & Configure

```bash
git clone https://github.com/mohashari/Invoice-gen-ocr.git
cd Invoice-gen-ocr

cp .env.example .env
# Edit .env — set JWT_SECRET to a random 32+ char string
```

### Start All Services

```bash
docker compose up -d --build

# Check all containers are healthy
docker compose ps
```

### Database Migration & Seeding

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npx tsx src/utils/seed.ts
```

The app is now available at **[http://localhost](http://localhost)**

### Development Commands

```bash
# View OCR worker logs
docker compose logs -f ocr-worker

# Rebuild a single service
docker compose up -d --build api

# Backend dev (outside Docker)
cd backend && npm install && npm run dev

# Frontend dev (outside Docker)
cd frontend && npm install && npm run dev
```

---

## Usage

1. **Login** at `http://localhost` with the admin credentials below
2. **Upload** an invoice image (PNG, JPG, TIFF) or PDF via drag & drop
3. **Wait** ~5–15 seconds — real-time OCR status updates via SSE
4. **Review** extracted fields; low-confidence fields are highlighted
5. **Edit** any incorrect values in the editor form
6. **Generate PDF** — click to produce a clean formatted invoice PDF
7. **Download** the PDF via the pre-signed MinIO/S3 URL

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Returns `accessToken` + sets `refreshToken` httpOnly cookie |
| `POST` | `/api/auth/refresh` | Exchange refresh cookie for new access token |
| `POST` | `/api/auth/logout` | Clears refresh token cookie |

### Invoices

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/invoices/upload` | Upload file (`multipart/form-data`) → triggers OCR |
| `GET` | `/api/invoices` | List (paginated). Query: `page`, `limit`, `status`, `search` |
| `GET` | `/api/invoices/:id` | Get invoice with extracted data + line items |
| `PUT` | `/api/invoices/:id` | Update / correct invoice fields |
| `DELETE` | `/api/invoices/:id` | Delete invoice |
| `GET` | `/api/invoices/:id/status` | **SSE stream** — real-time OCR job status |
| `POST` | `/api/invoices/:id/generate-pdf` | Trigger PDF generation |
| `GET` | `/api/invoices/:id/pdf` | Get pre-signed PDF download URL |

### Users (Admin only)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/me` | Get current user profile |

### Quick Example

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@invoice.local","password":"Admin1234!"}' \
  | jq -r .accessToken)

# Upload invoice
curl -X POST http://localhost/api/invoices/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@invoice.png"

# Stream status
curl -N "http://localhost/api/invoices/<id>/status" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@invoice.local` | `Admin1234!` |
| Accountant | `accountant@invoice.local` | `Accountant1234!` |

> Change these immediately in any shared or production environment.

---

## Port Mapping

| Service | Host Port | Container Port |
|---|---|---|
| Nginx — main entry | `80` | `80` |
| Backend API (direct) | `3001` | `3000` |
| Frontend (Vite) | `5173` | `5173` |
| PostgreSQL | `5434` | `5432` |
| Redis | `6380` | `6379` |
| MinIO API | `9002` | `9000` |
| MinIO Console | `9003` | `9001` |

MinIO Console: `http://localhost:9003` — credentials: `minioadmin` / `minioadmin`

---

## Role-Based Access Control

| Action | Admin | Accountant | Viewer |
|---|:---:|:---:|:---:|
| Upload invoice | ✅ | ✅ | ❌ |
| View own invoices | ✅ | ✅ | ✅ |
| View all invoices | ✅ | ❌ | ❌ |
| Edit invoice data | ✅ | ✅ | ❌ |
| Delete invoice | ✅ | ❌ | ❌ |
| Generate PDF | ✅ | ✅ | ✅ |
| Manage users | ✅ | ❌ | ❌ |

---

## Database Schema

```
users          → id, email, password_hash, role, created_at
invoices       → id, user_id, status, raw_file_key, pdf_key, ocr_confidence
invoice_data   → invoice_id, invoice_number, vendor_name, vendor_address,
                 issue_date, due_date, currency, subtotal, tax_amount,
                 total_amount, payment_terms, notes, raw_ocr_text, is_corrected
line_items     → invoice_id, description, quantity, unit_price, total, sort_order
ocr_jobs       → invoice_id, status, error_msg, started_at, finished_at
```

---

## Kubernetes Deployment

```bash
kubectl apply -f infra/k8s/configmap.yaml
kubectl apply -f infra/k8s/postgres-statefulset.yaml
kubectl apply -f infra/k8s/redis-statefulset.yaml
kubectl apply -f infra/k8s/api-deployment.yaml        # 3 replicas + HPA
kubectl apply -f infra/k8s/ocr-worker-deployment.yaml # 2 replicas + HPA
kubectl apply -f infra/k8s/ingress.yaml
```

---

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):

1. **Lint & type check** — ESLint + TypeScript
2. **Docker build** — validates all images build successfully
3. **Staging deploy** — automatic on push to `main`
4. **Production deploy** — manual gate required

---

## Environment Variables

See [`.env.example`](.env.example) for the full list.

| Variable | Description |
|---|---|
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` | Redis hostname |
| `S3_ENDPOINT` | MinIO/S3 endpoint URL |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |
| `OCR_WORKER_CALLBACK_URL` | API callback URL for OCR results |

---

## License

MIT
