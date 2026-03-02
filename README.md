# RJ Fintech Assessment - PERN Wallet Integrity Demo

This project implements a concurrency-safe **Departmental Expense Wallet** system with:

- PostgreSQL (local)
- Express + Node.js
- React + Tailwind CSS
- JWT authentication + protected routes

Setup env file

```env
PORT=4000
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/dbname
NODE_ENV=development
JWT_SECRET=your_long_random_secret
```

Then run:

```bash
npm install
npm run seed
npm run dev
```

Backend URL: `http://localhost:4000`

Seeded demo login password for all users: `Admin@123`

Example user emails:

- `engadmin1@rjfintech.local`
- `mktadmin1@rjfintech.local`
- `opsadmin1@rjfintech.local`
- `finadmin1@rjfintech.local`

## 3) Frontend setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## 4) Demo scenarios

1. Login as seeded admin user.
2. Click `Run High-Volume Case`.
   - 10 concurrent requests at 500 INR
   - expected balance: 45,000 INR
3. Click `Run Edge Case`.
   - wallet set to 2,000 INR
   - 2 concurrent requests at 1,500 INR
   - expected: 1 success, 1 declined, final balance 500 INR

## API summary

Public:

- `GET /health`
- `POST /auth/login`

Protected (Bearer token required):

- `GET /auth/me`
- `GET /api/departments`
- `GET /api/departments/:departmentId/users`
- `GET /api/departments/:departmentId/transactions`
- `POST /api/departments/:departmentId/pay`
- `POST /api/seed`

Payment payload:

```json
{
  "amount": 500,
  "invoiceRef": "INV-1001",
  "idempotencyKey": "optional-unique-key"
}
```
