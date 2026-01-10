const instancesEl = document.getElementById("instances");
const statusEl = document.getElementById("status");
const backendStatusEl = document.getElementById("backend-status");
const instanceCountEl = document.getElementById("instance-count");
const refreshBtn = document.getElementById("refresh-btn");
const createForm = document.getElementById("create-form");
const versionSelect = document.getElementById("version-select");
const authUserEl = document.getElementById("auth-user");
const logoutBtn = document.getElementById("logout-btn");
const mainCard = document.getElementById("main-card");
const mainQrCanvas = document.getElementById("main-qr");
const mainQrNote = document.getElementById("main-qr-note");
const mainQrRefresh = document.getElementById("main-qr-refresh");
const mainStatusPill = document.getElementById("main-status-pill");
const mainPidEl = document.getElementById("main-pid");
const mainNumberEl = document.getElementById("main-number");
const mainStartBtn = document.getElementById("main-start");
const mainStopBtn = document.getElementById("main-stop");
const mainResetBtn = document.getElementById("main-reset");

const QR_REFRESH_MS = 2500;
const DEFAULT_REPO_URL = "https://github.com/miangeldev/TestiBot.git";
const MAIN_USERNAME = "miangeldev";
const openQrPanels = new Set();
const qrPollers = new Map();
let mainQrPoller = null;
let mainRunning = false;
let authToken = localStorage.getItem("access_token");
let currentUser = null;
let branchesCache = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuth();
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  if (response.status === 204) return null;
  return response.json();
}

function renderInstances(instances) {
  instanceCountEl.textContent = String(instances.length);

  if (!instances.length) {
    stopAllQrPolling();
    openQrPanels.clear();
    instancesEl.innerHTML = '<div class="empty">No instances yet.</div>';
    return;
  }

  const availableIds = new Set(instances.map((instance) => String(instance.id)));
  openQrPanels.forEach((id) => {
    if (!availableIds.has(id)) {
      openQrPanels.delete(id);
    }
  });
  instances.forEach((instance) => {
    const id = String(instance.id);
    if (instance.status === "running" && !openQrPanels.has(id)) {
      openQrPanels.add(id);
    }
  });

  stopAllQrPolling();

  instancesEl.innerHTML = instances
    .map((instance, index) => {
      const statusClass =
        instance.status === "running" ? "tag--running" : "tag--stopped";
      const lastStarted = instance.last_started_at
        ? new Date(instance.last_started_at).toLocaleString()
        : "-";
      const version = instance.version || "default";
      const pid = instance.pid ?? "-";
      const instanceId = String(instance.id);
      const panelClass = openQrPanels.has(instanceId) ? "qr-panel is-open" : "qr-panel";
      const versionOptions = buildUpdateVersionOptions(instance.version || "");

      return `
        <article class="instance-card" style="--i:${index}">
          <div class="instance-meta">
            <div>
              <div class="instance-name">${escapeHtml(instance.name)}</div>
              <div class="instance-details">
                <span>Version: ${escapeHtml(version)}</span>
                <span>PID: ${escapeHtml(pid)}</span>
                <span>Last start: ${escapeHtml(lastStarted)}</span>
                <span>WA: ${escapeHtml(instance.wa_number || "-")}</span>
              </div>
            </div>
            <span class="tag ${statusClass}">${escapeHtml(instance.status)}</span>
          </div>
          <div class="instance-actions">
            ${
              instance.status === "running"
                ? `<button class="action action--danger" data-action="stop" data-id="${instance.id}">Stop</button>`
                : `<button class="action action--primary" data-action="start" data-id="${instance.id}">Start</button>`
            }
            <button class="action" data-action="qr" data-id="${instance.id}">Show QR</button>
            <button class="action" data-action="reset" data-id="${instance.id}">Reset session</button>
            <button class="action action--danger" data-action="delete" data-id="${instance.id}">Delete</button>
          </div>
          <div class="${panelClass}" id="qr-panel-${instance.id}">
            <div class="qr-canvas" id="qr-${instance.id}"></div>
            <div class="qr-note" id="qr-note-${instance.id}">
              Click "Show QR" to load the latest code.
            </div>
          </div>
          <form class="update-form" data-id="${instance.id}" data-current-version="${escapeHtml(
            instance.version || ""
          )}">
            <select name="version">${versionOptions}</select>
            <button class="action" type="submit">Update</button>
          </form>
        </article>
      `;
    })
    .join("");

  instances.forEach((instance) => {
    const instanceId = String(instance.id);
    if (openQrPanels.has(instanceId)) {
      startQrPolling(instanceId);
    }
  });
}

function hasMainAccess() {
  return Boolean(currentUser && currentUser.username === MAIN_USERNAME);
}

function updateMainAccess() {
  const allowed = hasMainAccess();
  if (mainCard) {
    mainCard.classList.toggle("is-hidden", !allowed);
  }
  if (!allowed) {
    mainRunning = false;
    if (mainQrCanvas) mainQrCanvas.innerHTML = "";
    if (mainQrNote) mainQrNote.textContent = "";
    if (mainStatusPill) {
      mainStatusPill.textContent = "";
      mainStatusPill.classList.remove("tag--running", "tag--stopped");
    }
    if (mainPidEl) mainPidEl.textContent = "";
    if (mainNumberEl) mainNumberEl.textContent = "";
    if (mainStartBtn) mainStartBtn.disabled = true;
    if (mainStopBtn) mainStopBtn.disabled = true;
    if (mainResetBtn) mainResetBtn.disabled = true;
    if (mainQrRefresh) mainQrRefresh.disabled = true;
    stopMainQrPolling();
    return;
  }
  if (mainResetBtn) mainResetBtn.disabled = false;
  if (mainQrRefresh) mainQrRefresh.disabled = false;
}

async function loadInstances() {
  if (!authToken) return;
  try {
    backendStatusEl.textContent = "online";
    const instances = await apiRequest("/instances/");
    renderInstances(instances);
    setStatus("Ready.");
  } catch (error) {
    backendStatusEl.textContent = "offline";
    renderInstances([]);
    setStatus(`Error: ${error.message}`, true);
  }
}

function setVersionOptions(branches) {
  if (!versionSelect) return;
  branchesCache = branches;
  versionSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Default branch";
  versionSelect.appendChild(defaultOption);

  branches.forEach((branch) => {
    const option = document.createElement("option");
    option.value = branch;
    option.textContent = branch;
    versionSelect.appendChild(option);
  });
}

function buildUpdateVersionOptions(currentVersion) {
  const options = [];
  const displayCurrent = currentVersion ? currentVersion : "default";
  options.push(
    `<option value="__keep" selected>Keep current (${escapeHtml(displayCurrent)})</option>`
  );
  branchesCache.forEach((branch) => {
    options.push(`<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`);
  });
  return options.join("");
}

async function loadBranches() {
  if (!versionSelect || !authToken) return;
  versionSelect.disabled = true;
  versionSelect.innerHTML = "";
  const loadingOption = document.createElement("option");
  loadingOption.value = "";
  loadingOption.textContent = "Loading branches...";
  versionSelect.appendChild(loadingOption);

  try {
    const data = await apiRequest("/instances/branches");
    const branches = Array.isArray(data?.branches) ? data.branches : [];
    setVersionOptions(branches);
  } catch (error) {
    setVersionOptions([]);
    setStatus(`Error loading branches: ${error.message}`, true);
  } finally {
    versionSelect.disabled = false;
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    repo_url: DEFAULT_REPO_URL,
  };

  const version = String(formData.get("version") || "").trim();

  if (version) payload.version = version;

  if (!payload.name) {
    setStatus("Name is required.", true);
    return;
  }

  setStatus("Creating instance...");
  try {
    await apiRequest("/instances/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createForm.reset();
    await loadInstances();
    setStatus("Instance created.");
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
});

refreshBtn.addEventListener("click", () => {
  setStatus("Refreshing...");
  loadInstances();
});

instancesEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === "qr") {
    toggleQrPanel(id);
    return;
  }

  if (action === "delete") {
    if (!confirm("Delete this instance? This will remove its folder.")) {
      return;
    }
    setStatus("Deleting instance...");
    try {
      await apiRequest(`/instances/${id}`, { method: "DELETE" });
      await loadInstances();
      setStatus("Instance deleted.");
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
    return;
  }

  if (action === "reset") {
    if (!confirm("Reset session? This will delete auth data and restart.")) {
      return;
    }
    setStatus("Resetting session...");
    try {
      await apiRequest(`/instances/${id}/reset`, { method: "POST" });
      await loadInstances();
      setStatus("Session reset.");
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
    return;
  }

  setStatus(`${action === "start" ? "Starting" : "Stopping"} instance...`);
  try {
    await apiRequest(`/instances/${id}/${action}`, { method: "POST" });
    await loadInstances();
    setStatus(`Instance ${action}ed.`);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
});

instancesEl.addEventListener("submit", async (event) => {
  const form = event.target.closest(".update-form");
  if (!form) return;
  event.preventDefault();

  const id = form.dataset.id;
  const version = String(form.querySelector('[name="version"]').value || "").trim();
  const currentVersion = String(form.dataset.currentVersion || "");
  const payload = {};

  if (version && version !== "__keep" && version !== currentVersion) {
    payload.version = version;
  }

  if (!Object.keys(payload).length) {
    setStatus("No update values provided.", true);
    return;
  }

  setStatus("Updating instance...");
  try {
    await apiRequest(`/instances/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadInstances();
    setStatus("Instance updated.");
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
});

function toggleQrPanel(instanceId) {
  const panel = document.getElementById(`qr-panel-${instanceId}`);
  if (!panel) return;
  const key = String(instanceId);
  const isOpen = panel.classList.toggle("is-open");
  if (isOpen) {
    openQrPanels.add(key);
    startQrPolling(key);
  } else {
    openQrPanels.delete(key);
    stopQrPolling(key);
  }
}

function renderQr(container, value) {
  if (typeof QRCode === "undefined") {
    container.textContent = value;
    return;
  }
  container.innerHTML = "";
  new QRCode(container, {
    text: value,
    width: 160,
    height: 160,
    colorDark: "#1b1b1b",
    colorLight: "#fff8ef",
  });
}

async function loadQr(instanceId) {
  const canvas = document.getElementById(`qr-${instanceId}`);
  const note = document.getElementById(`qr-note-${instanceId}`);
  if (!canvas || !note) return;

  note.textContent = "Loading QR...";
  try {
    const data = await apiRequest(`/instances/${instanceId}/qr`);
    if (!data || !data.qr) {
      canvas.innerHTML = "";
      note.textContent = "No QR available yet. Start the instance first.";
      return;
    }
    renderQr(canvas, data.qr);
    note.textContent = "Scan with WhatsApp within 30 seconds.";
  } catch (error) {
    canvas.innerHTML = "";
    note.textContent = `Error: ${error.message}`;
  }
}

function startQrPolling(instanceId) {
  const key = String(instanceId);
  if (qrPollers.has(key)) return;
  loadQr(key);
  const handle = setInterval(() => loadQr(key), QR_REFRESH_MS);
  qrPollers.set(key, handle);
}

function stopQrPolling(instanceId) {
  const key = String(instanceId);
  const handle = qrPollers.get(key);
  if (handle) {
    clearInterval(handle);
    qrPollers.delete(key);
  }
}

function stopAllQrPolling() {
  qrPollers.forEach((handle) => clearInterval(handle));
  qrPollers.clear();
}

async function loadMainQr() {
  if (!mainQrCanvas || !mainQrNote) return;
  if (!hasMainAccess()) return;
  mainQrNote.textContent = "Loading QR...";
  if (!authToken) {
    mainQrCanvas.innerHTML = "";
    mainQrNote.textContent = "Login required.";
    return;
  }
  if (!mainRunning) {
    mainQrCanvas.innerHTML = "";
    mainQrNote.textContent = "Main is stopped. Click Start main.";
    return;
  }
  try {
    const data = await apiRequest("/instances/main/qr");
    if (!data || !data.qr) {
      mainQrCanvas.innerHTML = "";
      mainQrNote.textContent = "Waiting for QR...";
      return;
    }
    renderQr(mainQrCanvas, data.qr);
    mainQrNote.textContent = "Scan with WhatsApp within 30 seconds.";
  } catch (error) {
    mainQrCanvas.innerHTML = "";
    mainQrNote.textContent = `Error: ${error.message}`;
  }
}

async function loadMainStatus() {
  if (!mainStatusPill) return;
  if (!authToken) return;
  if (!hasMainAccess()) return;
  try {
    const data = await apiRequest("/instances/main/status");
    mainRunning = Boolean(data?.running);
    mainStatusPill.textContent = mainRunning ? "running" : "stopped";
    mainStatusPill.classList.toggle("tag--running", mainRunning);
    mainStatusPill.classList.toggle("tag--stopped", !mainRunning);
    if (mainPidEl) {
      mainPidEl.textContent = data?.pid ? `pid ${data.pid}` : "";
    }
    if (mainNumberEl) {
      mainNumberEl.textContent = data?.wa_number ? `WA ${data.wa_number}` : "";
    }
    if (mainStartBtn) mainStartBtn.disabled = mainRunning;
    if (mainStopBtn) mainStopBtn.disabled = !mainRunning;
  } catch (error) {
    mainRunning = false;
    if (mainPidEl) mainPidEl.textContent = "";
    if (mainNumberEl) mainNumberEl.textContent = "";
    mainStatusPill.textContent = "unknown";
    mainStatusPill.classList.remove("tag--running");
    mainStatusPill.classList.add("tag--stopped");
  }
}

function startMainQrPolling() {
  if (!mainQrCanvas) return;
  if (!hasMainAccess()) return;
  if (mainQrPoller) clearInterval(mainQrPoller);
  const refreshMain = async () => {
    await loadMainStatus();
    await loadMainQr();
  };
  refreshMain();
  mainQrPoller = setInterval(refreshMain, QR_REFRESH_MS);
}

if (mainQrRefresh) {
  mainQrRefresh.addEventListener("click", () => {
    loadMainStatus();
    loadMainQr();
  });
}

if (mainStartBtn) {
  mainStartBtn.addEventListener("click", async () => {
    if (!hasMainAccess()) {
      setStatus("Main access restricted.", true);
      return;
    }
    setStatus("Starting main...");
    try {
      await apiRequest("/instances/main/start", { method: "POST" });
      await loadMainStatus();
      await loadMainQr();
      setStatus("Main started.");
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
  });
}

if (mainStopBtn) {
  mainStopBtn.addEventListener("click", async () => {
    if (!hasMainAccess()) {
      setStatus("Main access restricted.", true);
      return;
    }
    setStatus("Stopping main...");
    try {
      await apiRequest("/instances/main/stop", { method: "POST" });
      await loadMainStatus();
      await loadMainQr();
      setStatus("Main stopped.");
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
  });
}

if (mainResetBtn) {
  mainResetBtn.addEventListener("click", async () => {
    if (!hasMainAccess()) {
      setStatus("Main access restricted.", true);
      return;
    }
    if (!confirm("Reset main session? This will delete auth data and restart.")) {
      return;
    }
    setStatus("Resetting main session...");
    try {
      await apiRequest("/instances/main/reset", { method: "POST" });
      await loadMainStatus();
      await loadMainQr();
      setStatus("Main session reset.");
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAuth();
    setStatus("Signed out.");
  });
}

bootstrap();

function updateAuthUI() {
  const loggedIn = Boolean(authToken && currentUser);
  if (authUserEl) {
    authUserEl.textContent = loggedIn
      ? `Signed in as ${currentUser.username}`
      : "Not signed in";
  }
  if (logoutBtn) {
    logoutBtn.disabled = !loggedIn;
  }
  updateMainAccess();
}

async function fetchMe() {
  try {
    currentUser = await apiRequest("/auth/me");
    updateAuthUI();
  } catch (error) {
    clearAuth();
    throw error;
  }
}

function stopMainQrPolling() {
  if (mainQrPoller) {
    clearInterval(mainQrPoller);
    mainQrPoller = null;
  }
}

function redirectToLogin() {
  window.location.href = "/login";
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  mainRunning = false;
  localStorage.removeItem("access_token");
  stopAllQrPolling();
  stopMainQrPolling();
  updateAuthUI();
  redirectToLogin();
}

async function bootstrap() {
  updateAuthUI();
  if (!authToken) {
    redirectToLogin();
    return;
  }
  try {
    await fetchMe();
    startMainQrPolling();
    await loadBranches();
    await loadInstances();
  } catch {
    // auth cleared in fetchMe
  }
}
