# RJ Fintech - Architecture, Schema Diagram, and Runbook

This document explains:
- Database schema and table relationships
- System architecture
- Auth + request flow
- Local run steps (pgAdmin + backend + frontend)

## 1) Database Schema Diagram (ERD)

```mermaid
erDiagram
    departments ||--|| wallets : has_one
    departments ||--o{ app_users : has_many
    wallets ||--o{ expense_transactions : has_many
    app_users ||--o{ expense_transactions : creates

    departments {
        int id PK
        varchar code UNIQUE
        varchar name
    }

    wallets {
        int id PK
        int department_id FK UNIQUE
        numeric balance
        timestamptz updated_at
    }

    app_users {
        int id PK
        int department_id FK
        varchar full_name
        varchar email UNIQUE
        boolean is_admin
        varchar password_hash
    }

    expense_transactions {
        bigint id PK
        int wallet_id FK
        varchar invoice_ref
        numeric amount
        varchar status
        varchar reason
        int requested_by FK
        varchar idempotency_key
        timestamptz created_at
    }
```

## 2) System Architecture Diagram

```mermaid
flowchart LR
    UI[React + Tailwind Dashboard] -->|POST /auth/login| AUTH[Auth Routes]
    UI -->|Bearer Token| API[Protected API Routes]
    AUTH --> DB[(PostgreSQL)]
    API --> SVC[Wallet Service\nSerializable TX + Row Lock]
    SVC --> DB
```

## 3) Core Integrity Flow (Concurrency)

```mermaid
sequenceDiagram
    participant U1 as User A
    participant U2 as User B
    participant API as POST /api/departments/:id/pay
    participant DB as PostgreSQL

    par same millisecond
      U1->>API: pay 1500 (JWT A)
      U2->>API: pay 1500 (JWT B)
    end

    API->>DB: BEGIN + SERIALIZABLE
    API->>DB: SELECT wallet FOR UPDATE
    DB-->>API: locked row

    alt enough balance
      API->>DB: UPDATE wallet balance
      API->>DB: INSERT SUCCESS txn
      API->>DB: COMMIT
      API-->>U1: success
    else insufficient
      API->>DB: INSERT DECLINED txn
      API->>DB: COMMIT
      API-->>U2: declined
    end
```

## 4) Authentication and Authorization

Implemented:
- JWT login endpoint: `POST /auth/login`
- Protected routes via bearer middleware
- User identity is read from JWT (`sub`)
- Department access control: user can only access/pay in own department
- Admin enforcement in wallet service (`is_admin = true`)

Important:
- Payment payload does not accept `userId` anymore.
- `requested_by` is always taken from authenticated JWT user.

## 5) Local Setup (pgAdmin + run)

## Step 1: Create DB in pgAdmin

1. Open pgAdmin.
2. Connect local server.
3. Right click `Databases` -> `Create` -> `Database...`
4. Name: `rj_fintech`
5. Save.

## Step 2: Configure backend `.env`

Create file: `backend/.env`

```env
PORT=4000
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/rj_fintech
NODE_ENV=development
JWT_SECRET=your_long_random_secret
```

## Step 3: Start backend

```bash
cd backend
npm install
npm run seed
npm run dev
```

Seed creates 4 departments and 3 admin users each.

Demo password for every seeded user:
- `Admin@123`

Sample login emails:
- `engadmin1@rjfintech.local`
- `mktadmin1@rjfintech.local`
- `opsadmin1@rjfintech.local`
- `finadmin1@rjfintech.local`

## Step 4: Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173`

## Step 5: Verify flow

1. Login with seeded credential.
2. Run `High-Volume Case`.
3. Run `Edge Case`.
4. Confirm ledger + balances update correctly.

## 6) API Contract

Public:
- `GET /health`
- `POST /auth/login`

Protected:
- `GET /auth/me`
- `GET /api/departments`
- `GET /api/departments/:departmentId/users`
- `GET /api/departments/:departmentId/transactions`
- `POST /api/departments/:departmentId/pay`
- `POST /api/seed`

`/auth/login` request:

```json
{
  "email": "engadmin1@rjfintech.local",
  "password": "Admin@123"
}
```

`/api/departments/:departmentId/pay` request:

```json
{
  "amount": 500,
  "invoiceRef": "INV-1001",
  "idempotencyKey": "optional-key"
}
```

## 7) Important Files

- `backend/src/walletService.js` (core transaction integrity)
- `backend/src/authRoutes.js` (JWT login + me)
- `backend/src/authMiddleware.js` (route protection)
- `backend/src/routes.js` (protected business APIs)
- `backend/sql/schema.sql` (schema + constraints)
- `backend/src/seedData.js` (seed users/departments)
- `frontend/src/App.jsx` (login + dashboard + scenario simulation)
- `frontend/src/api.js` (token storage + authorized requests)
