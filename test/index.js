const path = require("path");
const {Bot, Persistence} = require("../dist");


const persistence = new Persistence(path.join(__dirname, "persist"), {foo: "test", bar: 13});
const bot = new Bot({
    featuresDirPath: path.join(__dirname, "features"),
    persistence,
    interactionStorageFilePath: path.join(__dirname, "interactions"),
    auth: {},
    namedChannels: config.channels,
    sharedConfig: config.config
});

bot.login();