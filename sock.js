const path = require('path');
const { default: makeWASocket, useSingleFileAuthState } = require('baileys');

/**
 * Creates and returns a WhatsApp socket using Baileys.
 * @param {string} [statePath] Path where auth state will be stored.
 * @returns {Promise<import('@adiwajshing/baileys').Socket>} Socket instance.
 */
async function createSocket(statePath) {
    const authFile = path.resolve(statePath || path.join(__dirname, 'auth_info.json'));
    const { state, saveCreds } = await useSingleFileAuthState(authFile);

    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        console.log('socket connection update', connection);
        if (lastDisconnect?.error) {
            console.log('last disconnect reason:', lastDisconnect.error.message);
        }
    });

    socket.ev.on('creds.update', saveCreds);

    return socket;
}

module.exports = createSocket;
