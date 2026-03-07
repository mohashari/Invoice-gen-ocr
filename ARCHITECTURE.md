# Invoice Generator with OCR — Architecture Plan

**Version:** 1.0
**Date:** 2026-03-07
**Author:** Senior Software Architect

---

## 1. Executive Summary

A web application that allows users to upload physical or scanned invoices, extract structured data via OCR, validate/edit the extracted data, and generate clean digital invoices (PDF/JSON). The system is designed for scalability, maintainability, and extensibility.

---

## 2. Goals & Non-Goals

### Goals
- Upload image/PDF documents and extract invoice fields via OCR
- Support manual correction of OCR results
- Generate standardized invoice output (PDF, JSON, CSV)
- Store invoice history with search and filter
- Role-based access (Admin, Accountant, Viewer)

### Non-Goals
- ERP/accounting system integration (Phase 2)
- Mobile native app (out of scope)
- Real-time multi-user collaboration

---

## 3. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                          │
│                     React + TypeScript + Vite                      │
│         Upload UI | Invoice Editor | Dashboard | PDF Preview       │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS / REST + WebSocket
┌──────────────────────────────▼─────────────────────────────────────┐
│                         API GATEWAY                                │
│              Nginx (reverse proxy + rate limiting)                 │
└────────┬──────────────────────────────────────────┬────────────────┘
         │                                          │
┌────────▼────────────┐                  ┌──────────▼──────────────┐
│   Backend API       │                  │    OCR Worker Service   │
│   Node.js + Fastify │◄────── Queue ───►│    Python + FastAPI     │
│   (REST + Auth)     │    (Bull/Redis)  │    Tesseract 5          │
└────────┬────────────┘                  └──────────┬──────────────┘
         │                                          │
┌────────▼────────────────────────────────────────▼──────────────────┐
│                          Data Layer                                │
│  PostgreSQL (structured)  │  Redis (cache/queue)  │  S3 (files)   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. System Components

### 4.1 Frontend — React SPA

| Concern        | Technology                                  |
|---------------|---------------------------------------------|
| Framework     | React 18 + TypeScript                       |
| Build Tool    | Vite                                        |
| State Mgmt    | Zustand (local) + React Query (server)      |
| UI Library    | shadcn/ui + Tailwind CSS                    |
| PDF Preview   | react-pdf                                   |
| Form Handling | React Hook Form + Zod                       |
| File Upload   | react-dropzone                              |
| Routing       | React Router v6                             |

**Key Pages/Views:**
- `/upload` — drag & drop invoice file upload
- `/invoices` — invoice list with filter/search/pagination
- `/invoices/:id/edit` — OCR result editor with field validation
- `/invoices/:id/preview` — generated PDF preview
- `/dashboard` — analytics (total invoices, amount summary)

---

### 4.2 Backend API — Node.js + Fastify

**Responsibilities:**
- Authentication & authorization (JWT + refresh tokens)
- File upload handling → upload to S3 → enqueue OCR job
- Invoice CRUD operations
- PDF generation (Puppeteer or pdfkit)
- Webhook/status endpoint for OCR job progress (SSE or WebSocket)

**API Routes:**

```
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

POST   /api/invoices/upload         # upload file → trigger OCR job
GET    /api/invoices                # list with pagination/filter
GET    /api/invoices/:id            # get single invoice + OCR data
PUT    /api/invoices/:id            # update/correct invoice fields
DELETE /api/invoices/:id
GET    /api/invoices/:id/pdf        # download generated PDF
GET    /api/invoices/:id/status     # SSE: job status stream

GET    /api/users/me
GET    /api/users                   # admin only
```

---

### 4.3 OCR Worker Service — Python + FastAPI

**Responsibilities:**
- Consume jobs from Redis queue (via rq or Celery)
- Preprocess images (deskew, denoise, binarize) using OpenCV
- Run OCR via Tesseract 5 (self-hosted, open-source)
- Parse raw OCR text into structured invoice fields (NLP/regex)
- Push structured result back to PostgreSQL + notify API via callback

**OCR Pipeline:**

```
Raw File (S3)
    │
    ▼
Image Preprocessing (OpenCV)
├── Grayscale conversion
├── Deskew & rotation correction
├── Noise removal
└── Contrast enhancement
    │
    ▼
OCR Engine (Tesseract 5)
├── LSTM neural network engine (--oem 1)
├── Language packs: eng + ind (Indonesian)
└── PSM modes per document layout (--psm 3/6/11)
    │
    ▼
Field Extraction (Regex + SpaCy NER)
├── Invoice number
├── Issue date / due date
├── Vendor name & address
├── Line items (description, qty, unit price)
├── Subtotal / tax / total
└── Payment terms
    │
    ▼
Confidence Scoring
└── Flag low-confidence fields for manual review
    │
    ▼
Store Result → PostgreSQL + S3 (original file)
```

**Supported Input Formats:** PNG, JPG, TIFF, PDF (converted to image via pdf2image)

---

### 4.4 Queue — Redis + Bull/BullMQ

- Jobs are enqueued when a file is uploaded
- Workers (Python) pull jobs and process them
- Job states: `pending → processing → completed | failed`
- Retries: 3 attempts with exponential backoff
- Dead letter queue for failed jobs

---

### 4.5 PDF Generator

- Triggered after user confirms/edits OCR data
- Uses **Puppeteer** (HTML → PDF) or **pdfkit** (programmatic)
- Invoice template rendered from Handlebars/React component
- Stored in S3, URL returned to client

---

### 4.6 Storage — AWS S3 (or MinIO self-hosted)

| Bucket                    | Contents                          |
|--------------------------|-----------------------------------|
| `invoices-raw`           | Original uploaded files           |
| `invoices-processed`     | Preprocessed images (OCR input)   |
| `invoices-pdf`           | Generated PDF invoices            |

- Pre-signed URLs for direct browser download
- Lifecycle policy: archive raw files after 90 days

---

## 5. Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'accountant', -- admin | accountant | viewer
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Invoices
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | processing | extracted | confirmed | error
  raw_file_url    TEXT,
  pdf_url         TEXT,
  ocr_confidence  NUMERIC(5,2),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Invoice Data (normalized extracted fields)
CREATE TABLE invoice_data (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_number  TEXT,
  vendor_name     TEXT,
  vendor_address  TEXT,
  issue_date      DATE,
  due_date        DATE,
  currency        TEXT DEFAULT 'IDR',
  subtotal        NUMERIC(15,2),
  tax_amount      NUMERIC(15,2),
  total_amount    NUMERIC(15,2),
  payment_terms   TEXT,
  notes           TEXT,
  raw_ocr_text    TEXT,         -- raw OCR output preserved
  is_corrected    BOOLEAN DEFAULT false
);

-- Line Items
CREATE TABLE invoice_line_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT,
  quantity     NUMERIC(10,3),
  unit_price   NUMERIC(15,2),
  total        NUMERIC(15,2),
  sort_order   INT
);

-- OCR Jobs
CREATE TABLE ocr_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID REFERENCES invoices(id),
  queue_job_id TEXT,
  status      TEXT DEFAULT 'queued', -- queued | processing | done | failed
  error_msg   TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
```

---

## 6. Security

| Concern              | Approach                                             |
|---------------------|------------------------------------------------------|
| Authentication       | JWT (access 15min) + Refresh token (7d, httpOnly)   |
| Authorization        | RBAC middleware per route                            |
| File Upload          | Type validation (magic bytes), max size 20MB        |
| Input Sanitization   | Zod on frontend, Joi/Zod on backend                 |
| SQL Injection        | Parameterized queries (Prisma ORM)                  |
| File Storage         | Private S3 buckets, pre-signed URLs (expires 1h)    |
| Rate Limiting        | Nginx + Fastify rate-limit plugin                   |
| HTTPS                | TLS termination at Nginx                            |
| Secrets              | Environment variables via `.env` + Vault (prod)     |

---

## 7. Infrastructure & Deployment

```
┌──────────────────────────────────────────┐
│              Docker Compose (dev)        │
│  - frontend (Vite dev server)            │
│  - api (Node.js)                         │
│  - ocr-worker (Python)                   │
│  - postgres                              │
│  - redis                                 │
│  - minio (S3 compatible)                 │
│  - nginx                                 │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│              Production (Kubernetes)     │
│  - Deployment: api (3 replicas)          │
│  - Deployment: ocr-worker (2 replicas)   │
│  - StatefulSet: postgres                 │
│  - StatefulSet: redis                    │
│  - Ingress: Nginx                        │
│  - Storage: AWS S3                       │
│  - Secrets: Kubernetes Secrets / Vault   │
└──────────────────────────────────────────┘
```

**CI/CD Pipeline (GitHub Actions):**
1. Lint + Type check
2. Unit + integration tests
3. Docker build & push to registry
4. Deploy to staging (auto)
5. Deploy to production (manual gate)

---

## 8. Project Folder Structure

```
invoice-gen-ocr/
├── ARCHITECTURE.md              # This document
├── PLAN.md                      # Sprint/milestone plan
├── docker-compose.yml
├── .env.example
│
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── upload/
│   │   │   ├── invoice/
│   │   │   └── shared/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── services/            # API client (axios/fetch)
│   │   ├── types/
│   │   └── utils/
│   ├── public/
│   └── package.json
│
├── backend/                     # Node.js + Fastify
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   ├── models/              # Prisma models
│   │   ├── jobs/                # Queue producers
│   │   └── utils/
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
│
├── ocr-worker/                  # Python + FastAPI
│   ├── app/
│   │   ├── worker.py            # Job consumer (rq/Celery)
│   │   ├── pipeline/
│   │   │   ├── preprocess.py    # OpenCV image processing
│   │   │   ├── ocr.py           # Tesseract 5 (pytesseract)
│   │   │   └── extract.py      # Field extraction (regex + NER)
│   │   ├── models/              # Pydantic schemas
│   │   └── utils/
│   ├── requirements.txt
│   └── Dockerfile
│
├── nginx/
│   └── nginx.conf
│
└── infra/
    ├── k8s/                     # Kubernetes manifests
    └── terraform/               # Infrastructure as code
```

---

## 9. Implementation Phases

### Phase 1 — MVP (4 weeks)
- [ ] Project scaffold (monorepo, Docker Compose)
- [ ] Auth (login, JWT, RBAC)
- [ ] File upload to MinIO/S3
- [ ] OCR pipeline (Tesseract + basic field extraction)
- [ ] Invoice editor UI (manual correction)
- [ ] PDF generation (basic template)
- [ ] Invoice list & detail pages

### Phase 2 — Enhancement (3 weeks)
- [ ] Tune Tesseract 5 accuracy (custom trained model for invoice layouts)
- [ ] Confidence scoring + auto-flag low-confidence fields
- [ ] Advanced PDF templates (branded)
- [ ] Export to CSV/JSON
- [ ] Dashboard analytics

### Phase 3 — Production Readiness (2 weeks)
- [ ] Kubernetes deployment
- [ ] CI/CD pipeline
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Logging (ELK / Loki)
- [ ] Load testing

---

## 10. Technology Summary

| Layer          | Technology                         |
|---------------|-------------------------------------|
| Frontend      | React 18, TypeScript, Vite, Tailwind|
| Backend API   | Node.js 20, Fastify, Prisma         |
| OCR Worker    | Python 3.11, FastAPI, Tesseract 5   |
| Queue         | Redis + BullMQ                      |
| Database      | PostgreSQL 16                       |
| File Storage  | AWS S3 / MinIO                      |
| PDF Engine    | Puppeteer / pdfkit                  |
| Auth          | JWT + bcrypt                        |
| Container     | Docker + Docker Compose             |
| Orchestration | Kubernetes (production)             |
| CI/CD         | GitHub Actions                      |
| Monitoring    | Prometheus + Grafana                |

---

## 11. Key Architecture Decisions

### ADR-001: OCR Engine Selection
- **Decision:** Tesseract 5 (exclusively)
- **Rationale:** Tesseract 5 uses an LSTM neural network engine (OEM 1) that delivers significantly better accuracy than legacy Tesseract 4. It is fully self-hosted, free, supports multiple language packs (including Indonesian), and avoids external API dependency and cost. PSM mode is tuned per document layout to maximize field extraction quality.

### ADR-002: Async OCR via Queue
- **Decision:** Decouple upload from OCR processing using Redis queue
- **Rationale:** OCR is CPU-intensive and variable in duration (1–30s). Async processing prevents API timeouts and allows horizontal scaling of workers independently.

### ADR-003: Separate OCR Worker (Python)
- **Decision:** Python microservice instead of Node.js addon
- **Rationale:** Python has a superior ecosystem for image processing (OpenCV, Pillow, SpaCy, pytesseract) with better library support and documentation.

### ADR-004: PostgreSQL over NoSQL
- **Decision:** PostgreSQL for all structured data
- **Rationale:** Invoice data is highly relational (invoice → line items → tax). ACID compliance is critical for financial data.

---

*This document is the living architecture reference. Update when major technical decisions change.*
