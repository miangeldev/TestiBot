const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('baileys');

/**
 * Creates and returns a WhatsApp socket using Baileys.
 * @param {string} [statePath] Path where auth state will be stored.
 * @returns {Promise<import('baileys').WASocket>} Socket instance.
 */
async function createSocket(statePath) {
    const authDir = path.resolve(statePath || path.join(__dirname, 'auth_info'));
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const qrPath = process.env.QR_PATH
        ? path.resolve(process.env.QR_PATH)
        : path.join(process.cwd(), 'qr.txt');
    const waInfoPath = process.env.WA_INFO_PATH
        ? path.resolve(process.env.WA_INFO_PATH)
        : path.join(process.cwd(), 'wa_info.json');

    const socket = makeWASocket({
        auth: state
    });

    socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('socket connection update', connection);
        if (qr) {
            fs.writeFileSync(qrPath, qr, 'utf-8');
        }
        if ((connection === 'open' || connection === 'close') && fs.existsSync(qrPath)) {
            fs.unlinkSync(qrPath);
        }
        if (socket.user?.id) {
            writeWaInfo(waInfoPath, socket.user.id);
        }
        if (
            connection === 'close' &&
            lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut &&
            fs.existsSync(waInfoPath)
        ) {
            fs.unlinkSync(waInfoPath);
        }
        if (lastDisconnect?.error) {
            console.log('last disconnect reason:', lastDisconnect.error.message);
        }
    });

    socket.ev.on('creds.update', saveCreds);

    return socket;
}

function writeWaInfo(targetPath, waId) {
    const formatted = formatWaId(waId);
    if (!formatted) return;
    const payload = {
        id: waId,
        number: formatted
    };
    fs.writeFileSync(targetPath, JSON.stringify(payload), 'utf-8');
}

function formatWaId(waId) {
    if (!waId) return null;
    const userPart = String(waId).split('@')[0].split(':')[0];
    const digits = userPart.replace(/\D/g, '');
    if (!digits) return null;
    const grouped = digits.replace(/(\d{2})(?=\d)/g, '$1 ');
    return `+${grouped}`.trim();
}

module.exports = createSocket;
