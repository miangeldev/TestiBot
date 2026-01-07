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

if (args['main']) {
    // Main instance
    global.instance = "main";
} else{
    // Read .env for other instances
    require('dotenv').config();
    global.instance = process.env.INSTANCE || "Not Found";
}
console.log(`Starting instance: ${global.instance}`);