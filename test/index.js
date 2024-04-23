const path = require("path");
const {Bot, Persistence} = require("../dist");
const {GatewayIntentBits} = require("discord.js");
const config = require("./config.json");

const persistence = new Persistence(
    path.join(__dirname, "persist"),
    {
        foo: "test",
        bar: 13
    }
);
const bot = new Bot({
    featuresDirPath: path.join(__dirname, "features"),
    servicesDefinitions: path.join(__dirname, "services.json"),
    persistence,
    interactionStorageFilePath: path.join(__dirname, "interactions"),
    sharedConfig: {},
    namedChannels: {
        "test": config.channel
    },
    cleanseCommands: config.cleanseCommands,
    auth: {
        appId: config.appId,
        token: config.token
    },
    additionalIntents: [GatewayIntentBits.GuildMembers]
});

bot.login();