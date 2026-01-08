function parseArguments() {
    /* Example: node index.js --port 8080 --debug */
    const args = process.argv.slice(2);
    let parsedArgs = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            let key = args[i].substring(2);
            let value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
            parsedArgs[key] = value;
            if (value !== true) i++;
        }
    }
    return parsedArgs;
}
const args = parseArguments();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DisconnectReason } = require('baileys');
const createSocket = require('./sock');
const dotenv = require('dotenv');

const envPath = process.env.ENV_PATH;
if (envPath) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const isMain = Boolean(args['main']);
const mainPidPath = path.join(__dirname, 'backend', 'app', 'data', 'main.pid');

if (isMain) {
    global.instance = "main";
    fs.mkdirSync(path.dirname(mainPidPath), { recursive: true });
    fs.writeFileSync(mainPidPath, String(process.pid), 'utf-8');
} else {
    global.instance = process.env.INSTANCE_NAME || process.env.INSTANCE || "Not Found";
}

let backendProcess = null;
let activeSocket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let isShuttingDown = false;

function startBackend() {
    const backendHost = process.env.BACKEND_HOST || "0.0.0.0";
    const backendPort = process.env.BACKEND_PORT || "8000";
    const backendCmd = process.env.BACKEND_CMD || "python";
    const backendArgs = process.env.BACKEND_ARGS
        ? process.env.BACKEND_ARGS.split(" ").filter(Boolean)
        : backendCmd.includes("python")
            ? ["-m", "uvicorn", "backend.app.main:app", "--host", backendHost, "--port", backendPort]
            : ["backend.app.main:app", "--host", backendHost, "--port", backendPort];

    const processHandle = spawn(backendCmd, backendArgs, {
        stdio: "inherit",
        cwd: __dirname
    });

    processHandle.on("exit", (code, signal) => {
        if (code !== null) {
            console.log(`Backend exited with code ${code}`);
        } else {
            console.log(`Backend exited with signal ${signal}`);
        }
    });

    return processHandle;
}

if (isMain && process.env.BACKEND_DISABLED !== "1") {
    backendProcess = startBackend();
}

console.log(`Starting instance: ${global.instance}`);

async function startBot() {
    const socket = await createSocket();
    activeSocket = socket;

    socket.ev.on('messages.upsert', async (messageUpdate) => {
        const message = messageUpdate.messages?.[0];
        if (!message || message.key.fromMe) return;

        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            '';

        if (!text.trim()) return;

        const reply = `🤖 ${global.instance} recibió: ${text}`;
        await socket.sendMessage(message.key.remoteJid, { text: reply });
    });

    socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            reconnectAttempts = 0;
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect && !isShuttingDown) {
                scheduleReconnect();
            } else {
                console.log('Socket closed, not reconnecting.');
            }
        }
    });
}

function scheduleReconnect() {
    if (reconnectTimer || isShuttingDown) return;
    reconnectAttempts += 1;
    const delay = Math.min(20000, 2000 * reconnectAttempts);
    console.log(`Reconnecting in ${delay}ms...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startBot().catch((error) => {
            console.error('Failed to reconnect bot', error);
            scheduleReconnect();
        });
    }, delay);
}

startBot().catch((error) => {
    console.error('Failed to start bot', error);
    scheduleReconnect();
});

function shutdown() {
    isShuttingDown = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (backendProcess) {
        backendProcess.kill("SIGTERM");
    }
    if (activeSocket && typeof activeSocket.end === 'function') {
        activeSocket.end(new Error('Process shutdown'));
    }
    if (isMain && fs.existsSync(mainPidPath)) {
        fs.unlinkSync(mainPidPath);
    }
}

process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
});

process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
});

process.on("exit", () => {
    if (isMain && fs.existsSync(mainPidPath)) {
        fs.unlinkSync(mainPidPath);
    }
});
