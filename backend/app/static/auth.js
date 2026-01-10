const statusEl = document.getElementById("status");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authToken = localStorage.getItem("access_token");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function redirectToApp() {
  window.location.href = "/app";
}

function clearAuth() {
  localStorage.removeItem("access_token");
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const body = options.body;
  if (
    body &&
    !headers["Content-Type"] &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams)
  ) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loginWithCredentials(username, password) {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  const data = await apiRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  localStorage.setItem("access_token", data.access_token);
  redirectToApp();
}

async function registerAccount(username, password) {
  await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  await loginWithCredentials(username, password);
}

async function verifyToken(token) {
  try {
    await apiRequest("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    redirectToApp();
  } catch {
    clearAuth();
  }
}

if (authToken) {
  verifyToken(authToken);
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    if (!username || !password) {
      setStatus("Username and password required.", true);
      return;
    }
    setStatus("Signing in...");
    try {
      await loginWithCredentials(username, password);
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    if (!username || !password) {
      setStatus("Username and password required.", true);
      return;
    }
    setStatus("Creating account...");
    try {
      await registerAccount(username, password);
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
  });
}
