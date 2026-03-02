import { useEffect, useMemo, useState } from "react";
import { api, authStore } from "./api";

const DEMO_PASSWORD = "Admin@123";

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value));
}

function makeInvoice(prefix, i) {
  return `${prefix}-${Date.now()}-${i}`;
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("engadmin1@rjfintech.local");
  const [loginPassword, setLoginPassword] = useState(DEMO_PASSWORD);
  const [user, setUser] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState(500);
  const [invoiceRef, setInvoiceRef] = useState(`INV-${Date.now()}`);
  const [statusText, setStatusText] = useState("Login to continue");
  const [loading, setLoading] = useState(false);

  const activeDepartment = useMemo(
    () => departments.find((d) => d.id === activeDepartmentId),
    [departments, activeDepartmentId]
  );

  async function bootstrapAuthenticatedData() {
    const me = await api.me();
    setUser(me.user);

    const deptRows = await api.getDepartments();
    setDepartments(deptRows);
    if (deptRows.length > 0) {
      setActiveDepartmentId(deptRows[0].id);
      const [userRows, txRows] = await Promise.all([
        api.getUsers(deptRows[0].id),
        api.getTransactions(deptRows[0].id)
      ]);
      setUsers(userRows);
      setTransactions(txRows);
    }

    setStatusText("Ready");
  }

  useEffect(() => {
    const token = authStore.getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }

    bootstrapAuthenticatedData()
      .catch(() => {
        authStore.setToken(null);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!activeDepartmentId || !user) return;
    Promise.all([api.getUsers(activeDepartmentId), api.getTransactions(activeDepartmentId)])
      .then(([userRows, txRows]) => {
        setUsers(userRows);
        setTransactions(txRows);
      })
      .catch((error) => setStatusText(error.message));
  }, [activeDepartmentId, user]);

  async function refreshActive() {
    if (!activeDepartmentId) return;
    const [deptRows, userRows, txRows] = await Promise.all([
      api.getDepartments(),
      api.getUsers(activeDepartmentId),
      api.getTransactions(activeDepartmentId)
    ]);
    setDepartments(deptRows);
    setUsers(userRows);
    setTransactions(txRows);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setStatusText("Signing in...");

    try {
      const result = await api.login({ email: loginEmail, password: loginPassword });
      authStore.setToken(result.token);
      await bootstrapAuthenticatedData();
    } catch (error) {
      setStatusText(error.message);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    authStore.setToken(null);
    setUser(null);
    setDepartments([]);
    setUsers([]);
    setTransactions([]);
    setActiveDepartmentId(null);
    setStatusText("Logged out");
  }

  async function handleManualPay() {
    if (!activeDepartmentId) return;
    setLoading(true);
    setStatusText("Submitting payment...");

    try {
      const result = await api.pay(activeDepartmentId, {
        amount: Number(amount),
        invoiceRef,
        idempotencyKey: `manual-${invoiceRef}`
      });
      setStatusText(`${result.status}: ${result.reason ?? "processed"}`);
      setInvoiceRef(`INV-${Date.now()}`);
      await refreshActive();
    } catch (error) {
      setStatusText(error.message);
      await refreshActive();
    } finally {
      setLoading(false);
    }
  }

  async function loadScenarioTokens() {
    const teamUsers = await api.getUsers(activeDepartmentId);
    if (teamUsers.length < 3) {
      throw new Error("At least 3 users required for scenario simulation");
    }

    const loginResults = await Promise.all(
      teamUsers.slice(0, 3).map((u) => api.loginWithCredentials({ email: u.email, password: DEMO_PASSWORD }))
    );

    return loginResults.map((r) => r.token);
  }

  async function runHighVolumeScenario() {
    if (!activeDepartmentId) return;
    setLoading(true);
    setStatusText("Running high-volume valid case with 3 authenticated users...");

    try {
      await api.reseed();
      await refreshActive();
      const tokens = await loadScenarioTokens();

      const requests = Array.from({ length: 10 }).map((_, i) =>
        api.payWithToken(
          activeDepartmentId,
          {
            amount: 500,
            invoiceRef: makeInvoice("HV", i + 1),
            idempotencyKey: `hv-${i + 1}-${Date.now()}`
          },
          tokens[i % tokens.length]
        )
      );

      const settled = await Promise.allSettled(requests);
      const success = settled.filter((r) => r.status === "fulfilled").length;
      const declined = settled.length - success;

      await refreshActive();
      setStatusText(`High-volume case done: ${success} success, ${declined} declined. Expected balance: INR 45,000.`);
    } catch (error) {
      setStatusText(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function runInsufficientFundsScenario() {
    if (!activeDepartmentId) return;
    setLoading(true);
    setStatusText("Running insufficient-funds race with 2 authenticated users...");

    try {
      await api.reseed();
      await refreshActive();
      const tokens = await loadScenarioTokens();

      await api.payWithToken(
        activeDepartmentId,
        {
          amount: 48000,
          invoiceRef: makeInvoice("SET", 1),
          idempotencyKey: `set-2000-${Date.now()}`
        },
        tokens[0]
      );

      const race = [
        api.payWithToken(
          activeDepartmentId,
          {
            amount: 1500,
            invoiceRef: makeInvoice("EDGE", 1),
            idempotencyKey: `edge-1-${Date.now()}`
          },
          tokens[0]
        ),
        api.payWithToken(
          activeDepartmentId,
          {
            amount: 1500,
            invoiceRef: makeInvoice("EDGE", 2),
            idempotencyKey: `edge-2-${Date.now()}`
          },
          tokens[1]
        )
      ];

      const settled = await Promise.allSettled(race);
      const success = settled.filter((x) => x.status === "fulfilled").length;
      const declined = settled.length - success;

      await refreshActive();
      setStatusText(`Edge case done: ${success} success, ${declined} declined. Expected balance: INR 500.`);
    } catch (error) {
      setStatusText(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return <div className="p-8 text-sm text-slate-700">Checking session...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
        <form
          onSubmit={handleLogin}
          className="w-full rounded-2xl border border-brand-200 bg-white/90 p-8 shadow-panel backdrop-blur"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-brand-700">RJ Fintech</p>
          <h1 className="mt-2 font-display text-3xl font-black text-brand-900">Admin Login</h1>
          <p className="mt-2 text-sm text-slate-600">Demo seeded credential password: {DEMO_PASSWORD}</p>

          <label className="mt-6 block text-sm font-semibold text-slate-700">Email</label>
          <input
            type="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-200 px-3 py-2"
            required
          />

          <label className="mt-4 block text-sm font-semibold text-slate-700">Password</label>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-200 px-3 py-2"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg border border-brand-700 bg-brand-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Sign In
          </button>

          <p className="mt-4 text-sm text-slate-600">Status: {statusText}</p>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 text-slate-900 md:px-8">
      <header className="mb-6 rounded-2xl border border-brand-200/70 bg-white/85 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-body text-sm uppercase tracking-[0.18em] text-brand-700">RJ Fintech Solutions</p>
            <h1 className="mt-2 font-display text-3xl font-black text-brand-900 md:text-4xl">
              Departmental Expense Wallet Simulator
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as <span className="font-bold">{user.fullName}</span> ({user.departmentCode})
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Logout
          </button>
        </div>
      </header>

      <section className="mb-6 grid gap-3 md:grid-cols-4">
        {departments.map((dept) => {
          const active = dept.id === activeDepartmentId;
          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => setActiveDepartmentId(dept.id)}
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? "border-brand-600 bg-brand-700 text-white shadow-panel"
                  : "border-brand-200 bg-white/90 text-brand-900 hover:border-brand-500"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.15em] opacity-80">{dept.code}</div>
              <div className="mt-1 text-lg font-bold">{dept.name}</div>
              <div className="mt-2 text-sm font-semibold">{money(dept.balance)}</div>
            </button>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-brand-200 bg-white/90 p-6 shadow-panel fade-in">
          <h2 className="font-display text-2xl font-bold text-brand-900">Wallet Actions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Active department: <span className="font-bold">{activeDepartment?.name ?? "-"}</span>
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={runHighVolumeScenario}
              disabled={loading}
              className="rounded-lg border border-brand-700 bg-brand-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Run High-Volume Case
            </button>
            <button
              type="button"
              onClick={runInsufficientFundsScenario}
              disabled={loading}
              className="rounded-lg border border-brand-800 bg-brand-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Run Edge Case
            </button>
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                setStatusText("Reseeding data...");
                try {
                  await api.reseed();
                  await refreshActive();
                  setStatusText("Reseed completed.");
                } catch (error) {
                  setStatusText(error.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Reset Demo Data
            </button>
          </div>

          <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-brand-800">Manual Payment</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                type="number"
                min="1"
                className="rounded-lg border border-brand-200 px-3 py-2"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />

              <input
                type="text"
                className="rounded-lg border border-brand-200 px-3 py-2"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={handleManualPay}
              disabled={loading}
              className="mt-3 rounded-lg border border-brand-600 bg-white px-4 py-2 text-sm font-bold text-brand-800 disabled:opacity-50"
            >
              Pay Invoice as {user.fullName}
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <span className="font-bold">Status:</span> {statusText}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-white/90 p-6 shadow-panel fade-in">
          <h2 className="font-display text-2xl font-bold text-brand-900">Recent Ledger Entries</h2>
          <div className="mt-4 max-h-[480px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-[0.13em] text-brand-700">
                  <th className="py-2">Invoice</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">By</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-brand-50">
                    <td className="py-3 pr-2 text-xs font-semibold text-slate-700">{tx.invoiceRef}</td>
                    <td className="py-3 pr-2 font-bold">{money(tx.amount)}</td>
                    <td className="py-3 pr-2 text-xs">{tx.requestedBy}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          tx.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td className="py-6 text-center text-slate-500" colSpan="4">
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
