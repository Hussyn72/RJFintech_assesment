import { Router } from "express";
import { z } from "zod";
import { payInvoiceForDepartment } from "./walletService.js";
import { pool } from "./db.js";
import { requireAuth } from "./authMiddleware.js";
import { seedDemoData } from "./seedData.js";

const router = Router();

router.use(requireAuth);

const paySchema = z.object({
  amount: z.number().positive(),
  invoiceRef: z.string().min(3).max(120),
  idempotencyKey: z.string().min(6).max(120).optional()
});

function parseDepartmentId(value) {
  const departmentId = Number(value);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return null;
  }
  return departmentId;
}

function ensureDepartmentAccess(req, departmentId) {
  if (req.authUser.departmentId !== departmentId) {
    throw Object.assign(new Error("Forbidden for this department"), { statusCode: 403 });
  }
}

router.get("/departments", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.code, d.name, w.balance
       FROM departments d
       JOIN wallets w ON w.department_id = d.id
       WHERE d.id = $1
       ORDER BY d.id ASC`,
      [req.authUser.departmentId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/departments/:departmentId/users", async (req, res, next) => {
  try {
    const departmentId = parseDepartmentId(req.params.departmentId);
    if (!departmentId) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    ensureDepartmentAccess(req, departmentId);

    const result = await pool.query(
      `SELECT id, full_name AS "fullName", email
       FROM app_users
       WHERE department_id = $1
       ORDER BY id ASC`,
      [departmentId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/departments/:departmentId/transactions", async (req, res, next) => {
  try {
    const departmentId = parseDepartmentId(req.params.departmentId);
    if (!departmentId) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    ensureDepartmentAccess(req, departmentId);

    const result = await pool.query(
      `SELECT t.id,
              t.invoice_ref AS "invoiceRef",
              t.amount,
              t.status,
              t.reason,
              t.created_at AS "createdAt",
              u.full_name AS "requestedBy"
       FROM expense_transactions t
       JOIN wallets w ON w.id = t.wallet_id
       JOIN app_users u ON u.id = t.requested_by
       WHERE w.department_id = $1
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [departmentId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/departments/:departmentId/pay", async (req, res, next) => {
  try {
    const departmentId = parseDepartmentId(req.params.departmentId);
    if (!departmentId) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    ensureDepartmentAccess(req, departmentId);

    const parsed = paySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed", issues: parsed.error.issues });
    }

    const outcome = await payInvoiceForDepartment({
      departmentId,
      userId: req.authUser.userId,
      ...parsed.data
    });

    if (outcome.status === "DECLINED") {
      return res.status(409).json(outcome);
    }

    return res.status(201).json(outcome);
  } catch (error) {
    next(error);
  }
});

router.post("/seed", async (req, res, next) => {
  try {
    if (!req.authUser.isAdmin) {
      return res.status(403).json({ message: "Only admins can reseed" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await seedDemoData(client);
      await client.query("COMMIT");
      res.json({ message: "Seed reset completed" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

export default router;
