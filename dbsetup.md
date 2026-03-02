Detailed diagrams + full walkthrough:

- `docs/ARCHITECTURE_AND_RUNBOOK.md`

## Local Run (No Docker)

## 1) Create DB in pgAdmin

Create database:

```sql
CREATE DATABASE rj_fintech;
```

## 2) Backend setup

```bash
cd backend
copy .env.example .env
```

Update `backend/.env` with your local credentials and JWT secret:
