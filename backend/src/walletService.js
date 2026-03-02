import { pool } from "./db.js";

const MAX_SERIALIZATION_RETRIES = 3;

function isRetryableSerializationError(error) {
  return error?.code === "40001";
}

export async function payInvoiceForDepartment({
  departmentId,
  userId,
  amount,
  invoiceRef,
  idempotencyKey
}) {
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt += 1) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

      const membership = await client.query(
        `SELECT 1
         FROM app_users
         WHERE id = $1 AND department_id = $2 AND is_admin = true`,
        [userId, departmentId]
      );

      if (membership.rowCount === 0) {
        throw Object.assign(new Error("User is not authorized for this department"), { statusCode: 403 });
      }

      const walletResult = await client.query(
        `SELECT w.id, w.balance
         FROM wallets w
         WHERE w.department_id = $1
         FOR UPDATE`,
        [departmentId]
      );

      if (walletResult.rowCount === 0) {
        throw Object.assign(new Error("Wallet not found"), { statusCode: 404 });
      }

      const wallet = walletResult.rows[0];
      const currentBalance = Number(wallet.balance);

      if (idempotencyKey) {
        const existing = await client.query(
          `SELECT id, status, reason, amount, created_at
           FROM expense_transactions
           WHERE wallet_id = $1 AND idempotency_key = $2`,
          [wallet.id, idempotencyKey]
        );

        if (existing.rowCount > 0) {
          const e = existing.rows[0];
          await client.query("COMMIT");
          return {
            id: e.id,
            status: e.status,
            reason: e.reason,
            amount: Number(e.amount),
            duplicate: true,
            balance: currentBalance,
            createdAt: e.created_at
          };
        }
      }

      if (currentBalance < amount) {
        const declinedTx = await client.query(
          `INSERT INTO expense_transactions
           (wallet_id, invoice_ref, amount, status, reason, requested_by, idempotency_key)
           VALUES ($1, $2, $3, 'DECLINED', 'INSUFFICIENT_FUNDS', $4, $5)
           RETURNING id, created_at`,
          [wallet.id, invoiceRef, amount, userId, idempotencyKey ?? null]
        );

        await client.query("COMMIT");

        return {
          id: declinedTx.rows[0].id,
          status: "DECLINED",
          reason: "INSUFFICIENT_FUNDS",
          amount,
          balance: currentBalance,
          createdAt: declinedTx.rows[0].created_at
        };
      }

      const updated = await client.query(
        `UPDATE wallets
         SET balance = balance - $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING balance`,
        [amount, wallet.id]
      );

      const successTx = await client.query(
        `INSERT INTO expense_transactions
         (wallet_id, invoice_ref, amount, status, requested_by, idempotency_key)
         VALUES ($1, $2, $3, 'SUCCESS', $4, $5)
         RETURNING id, created_at`,
        [wallet.id, invoiceRef, amount, userId, idempotencyKey ?? null]
      );

      await client.query("COMMIT");

      return {
        id: successTx.rows[0].id,
        status: "SUCCESS",
        amount,
        balance: Number(updated.rows[0].balance),
        createdAt: successTx.rows[0].created_at
      };
    } catch (error) {
      await client.query("ROLLBACK");

      if (isRetryableSerializationError(error) && attempt < MAX_SERIALIZATION_RETRIES) {
        continue;
      }

      if (error.code === "23505") {
        throw Object.assign(new Error("Duplicate invoice or idempotency key"), { statusCode: 409 });
      }

      throw error;
    } finally {
      client.release();
    }
  }

  throw Object.assign(new Error("Could not safely complete transaction after retries"), {
    statusCode: 503
  });
}
