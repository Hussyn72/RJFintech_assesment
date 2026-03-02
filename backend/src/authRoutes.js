import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { requireAuth } from "./authMiddleware.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed", issues: parsed.error.issues });
    }

    const { email, password } = parsed.data;

    const userResult = await pool.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.department_id AS "departmentId", u.is_admin AS "isAdmin", u.password_hash AS "passwordHash",
              d.name AS "departmentName", d.code AS "departmentCode"
       FROM app_users u
       JOIN departments d ON d.id = u.department_id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    const matches = user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
    if (!matches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw Object.assign(new Error("JWT_SECRET is not configured"), { statusCode: 500 });
    }

    const token = jwt.sign(
      {
        email: user.email,
        departmentId: user.departmentId,
        isAdmin: user.isAdmin
      },
      secret,
      {
        subject: String(user.id),
        expiresIn: "8h"
      }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        departmentCode: user.departmentCode,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.department_id AS "departmentId", u.is_admin AS "isAdmin",
              d.name AS "departmentName", d.code AS "departmentCode"
       FROM app_users u
       JOIN departments d ON d.id = u.department_id
       WHERE u.id = $1`,
      [req.authUser.userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: userResult.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
