const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

function getToken() {
  return localStorage.getItem("rj_token");
}

function setToken(token) {
  if (token) {
    localStorage.setItem("rj_token", token);
  } else {
    localStorage.removeItem("rj_token");
  }
}

async function req(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message ?? "Request failed";
    throw Object.assign(new Error(message), { status: response.status, payload: data });
  }

  return data;
}

export const authStore = {
  getToken,
  setToken
};

export const api = {
  login(payload) {
    return req("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  me() {
    return req("/auth/me");
  },
  getDepartments() {
    return req("/api/departments");
  },
  getUsers(departmentId) {
    return req(`/api/departments/${departmentId}/users`);
  },
  getTransactions(departmentId) {
    return req(`/api/departments/${departmentId}/transactions`);
  },
  pay(departmentId, payload) {
    return req(`/api/departments/${departmentId}/pay`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  payWithToken(departmentId, payload, token) {
    return req(`/api/departments/${departmentId}/pay`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  },
  loginWithCredentials(payload) {
    return req("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  reseed() {
    return req("/api/seed", {
      method: "POST"
    });
  }
};
