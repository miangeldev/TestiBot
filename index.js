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
const createSocket = require('./sock');
const dotenv = require('dotenv');

if (args['main']) {
    global.instance = "main";
} else {
    const envPath = process.env.ENV_PATH;
    if (envPath) {
        dotenv.config({ path: envPath });
    } else {
        dotenv.config();
    }
    global.instance = process.env.INSTANCE_NAME || process.env.INSTANCE || "Not Found";
}

console.log(`Starting instance: ${global.instance}`);

async function startBot() {
    const socket = await createSocket();

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
}

startBot().catch((error) => {
    console.error('Failed to start bot', error);
    process.exitCode = 1;
});
