import bcrypt from "bcryptjs";

export const DEFAULT_ADMIN_PASSWORD = "Admin@123";

const DEPARTMENTS = [
  { code: "ENG", name: "Engineering" },
  { code: "MKT", name: "Marketing" },
  { code: "OPS", name: "Operations" },
  { code: "FIN", name: "Finance" }
];

export async function seedDemoData(client) {
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

  await client.query("TRUNCATE expense_transactions, app_users, wallets, departments RESTART IDENTITY CASCADE");

  for (const dept of DEPARTMENTS) {
    const deptInsert = await client.query(
      "INSERT INTO departments (code, name) VALUES ($1, $2) RETURNING id",
      [dept.code, dept.name]
    );
    const departmentId = deptInsert.rows[0].id;

    await client.query("INSERT INTO wallets (department_id, balance) VALUES ($1, $2)", [departmentId, 50000]);

    for (let i = 1; i <= 3; i += 1) {
      await client.query(
        `INSERT INTO app_users (department_id, full_name, email, is_admin, password_hash)
         VALUES ($1, $2, $3, true, $4)`,
        [
          departmentId,
          `${dept.name} Admin ${i}`,
          `${dept.code.toLowerCase()}admin${i}@rjfintech.local`,
          passwordHash
        ]
      );
    }
  }
}
