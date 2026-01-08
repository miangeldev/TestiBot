const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState } = require('baileys');

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
        if (lastDisconnect?.error) {
            console.log('last disconnect reason:', lastDisconnect.error.message);
        }
    });

    socket.ev.on('creds.update', saveCreds);

    return socket;
}

module.exports = createSocket;
