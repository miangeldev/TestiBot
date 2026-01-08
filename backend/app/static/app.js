const instancesEl = document.getElementById("instances");
const statusEl = document.getElementById("status");
const backendStatusEl = document.getElementById("backend-status");
const instanceCountEl = document.getElementById("instance-count");
const refreshBtn = document.getElementById("refresh-btn");
const createForm = document.getElementById("create-form");
const mainQrCanvas = document.getElementById("main-qr");
const mainQrNote = document.getElementById("main-qr-note");
const mainQrRefresh = document.getElementById("main-qr-refresh");

const QR_REFRESH_MS = 2500;
const openQrPanels = new Set();
const qrPollers = new Map();
let mainQrPoller = null;

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
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

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
      const port = instance.port ?? "-";
      const pid = instance.pid ?? "-";
      const instanceId = String(instance.id);
      const panelClass = openQrPanels.has(instanceId) ? "qr-panel is-open" : "qr-panel";

      return `
        <article class="instance-card" style="--i:${index}">
          <div class="instance-meta">
            <div>
              <div class="instance-name">${escapeHtml(instance.name)}</div>
              <div class="instance-details">
                <span>Version: ${escapeHtml(version)}</span>
                <span>Port: ${escapeHtml(port)}</span>
                <span>PID: ${escapeHtml(pid)}</span>
                <span>Last start: ${escapeHtml(lastStarted)}</span>
              </div>
            </div>
            <span class="tag ${statusClass}">${escapeHtml(instance.status)}</span>
          </div>
          <div class="instance-details">
            <span>Path: ${escapeHtml(instance.path)}</span>
            <span>Env: ${escapeHtml(instance.env_path)}</span>
          </div>
          <div class="instance-actions">
            ${
              instance.status === "running"
                ? `<button class="action action--danger" data-action="stop" data-id="${instance.id}">Stop</button>`
                : `<button class="action action--primary" data-action="start" data-id="${instance.id}">Start</button>`
            }
            <button class="action" data-action="qr" data-id="${instance.id}">Show QR</button>
          </div>
          <div class="${panelClass}" id="qr-panel-${instance.id}">
            <div class="qr-canvas" id="qr-${instance.id}"></div>
            <div class="qr-note" id="qr-note-${instance.id}">
              Click "Show QR" to load the latest code.
            </div>
          </div>
          <form class="update-form" data-id="${instance.id}">
            <input name="version" placeholder="Version (${escapeHtml(version)})" />
            <input name="port" type="number" min="1" max="65535" placeholder="Port (${escapeHtml(port)})" />
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

async function loadInstances() {
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

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    repo_url: String(formData.get("repo_url") || "").trim(),
  };

  const version = String(formData.get("version") || "").trim();
  const port = String(formData.get("port") || "").trim();

  if (version) payload.version = version;
  if (port) payload.port = Number(port);

  if (!payload.name || !payload.repo_url) {
    setStatus("Name and repo URL are required.", true);
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
  const port = String(form.querySelector('[name="port"]').value || "").trim();
  const payload = {};

  if (version) payload.version = version;
  if (port) payload.port = Number(port);

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
  mainQrNote.textContent = "Loading QR...";
  try {
    const data = await apiRequest("/instances/main/qr");
    if (!data || !data.qr) {
      mainQrCanvas.innerHTML = "";
      mainQrNote.textContent = "No QR available yet. Start the main instance.";
      return;
    }
    renderQr(mainQrCanvas, data.qr);
    mainQrNote.textContent = "Scan with WhatsApp within 30 seconds.";
  } catch (error) {
    mainQrCanvas.innerHTML = "";
    mainQrNote.textContent = `Error: ${error.message}`;
  }
}

function startMainQrPolling() {
  if (!mainQrCanvas) return;
  if (mainQrPoller) clearInterval(mainQrPoller);
  loadMainQr();
  mainQrPoller = setInterval(loadMainQr, QR_REFRESH_MS);
}

if (mainQrRefresh) {
  mainQrRefresh.addEventListener("click", () => {
    loadMainQr();
  });
}

startMainQrPolling();
loadInstances();
