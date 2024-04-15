const fs = require("fs");
const path = require("path");
const {
    Client: DiscordClient,
    Events: DiscordEvents,
    GatewayIntentBits
} = require("discord.js");
const Persistence = require("./persistence");
const Interactions = require("./interactions");
const Commands = require("./commands");
const {logError} = require("./errors");
const logger = require("./logger");

// noinspection JSFileReferences
/** @type {typeof import('./config.dist.json')} */
const config = fs.existsSync("./config.json")
    ? require("./config.json")
    : require("./config.build.json");

const persistence = new Persistence("persist");
const discord = new DiscordClient({intents: [GatewayIntentBits.Guilds]});
const commands = new Commands(logger("Commands"));
const interactions = new Interactions();

/** @typedef {Record<string, import('discord.js').TextChannel>} ChannelsMapping */

/** @type {ChannelsMapping} */
const channels = {};

const featuresDir = path.join(__dirname, "features");
const featureLoaderLogger = logger("featureLoader");
/** @type {Object<string, import('./features/feature')>} */
const features = fs.readdirSync(featuresDir).reduce((acc, featureName) => {
    const fullPath = path.join(featuresDir, featureName);
    if (!fs.statSync(fullPath).isDirectory()) return acc;

    if (config.disabledFeatures.includes(featureName)) {
        featureLoaderLogger(`❌ Pomijam moduł "${featureName}" - wyłączony w konfiguracji`);
        return acc;
    }

    const featureMainPath = path.join(fullPath, "main.js");

    if (!fs.existsSync(featureMainPath)) {
        featureLoaderLogger(`❌ Pomijam moduł "${featureName}" - brak pliku "main.js"`);
        return acc;
    }

    const FeatureClass = require(featureMainPath);
    acc[featureName] = new FeatureClass(discord, blogger, persistence, interactions, commands, config, channels);

    return acc;
}, {});


interactions.handlers = persistence.data.interactionHandlers;
interactions.handlersModifiedCallback = () => {
    const log = logger("onHandlersModified");

    log("⚡ Wywołanie")
    persistence.data.interactionHandlers = interactions.handlers;
    persistence.saveState();
};

async function fetchConfigChannels() {
    const log = logger("fetchConfigChannels");

    // noinspection JSValidateTypes
    /** @type {Object<string, string>} */
    const configChannels = config.channels;

    for (const [internalName, channelId] of Object.entries(configChannels)) {
        // noinspection JSCheckFunctionSignatures
        const channel = await discord.channels.fetch(channelId);
        log(`[fetchConfigChannels] ${internalName} (${channelId}) -> #${channel.name}`);
        // noinspection JSValidateTypes
        channels[internalName] = channel;
    }
}

discord.once(DiscordEvents.ClientReady,  async readyClient => {
    const log = logger("main");

    log(`✔️ Zalogowany jako ${readyClient.user.tag}`);
    log("💾 Załadowano stan:\n%o", persistence.data);

    readyClient.on(DiscordEvents.InteractionCreate, async interaction => {
        log("🖱️ Odebrano jakąś interakcję!");
        try {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                log("🖱️ Interakcja: przycisk/modal");
                const handled = await interactions.emit(interaction);

                if (!handled) {
                    log(`❌ Nie obsłużono interakcji ${interaction.id} - prawdopodobnie straciła ważność.`);
                    await interaction.reply({
                        content: "# ⏱️ Koniec czasu!\nNajwyraźniej minęło za dużo czasu i już nie możesz wykonać tej interakcji!",
                        ephemeral: true
                    });
                }
            } else if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                log("🖱️ Interakcja: komenda");
                await commands.handle(interaction);
            }
        } catch (e) {
            logError(e);

            try {
                await interaction.reply({
                    content: "# Sorka, coś się stało...\nWydarzyło się coś niespodziewanego. **Powiadom o tym Bartka!**",
                    ephemeral: true
                });
            } catch (e) {
                await interaction.editReply({
                    content: "# Sorka, coś się stało...\nWydarzyło się coś niespodziewanego. **Powiadom o tym Bartka!**",
                    ephemeral: true
                });
            }
        }
    });

    // Blogger init
    await blogger.fetchUrl();

    // Channels
    log("🌍 Pobieranie kanałów...");
    await fetchConfigChannels();
    log(`🌍 Pobrano ${Object.keys(channels).length} kanałów!`);

    // Features
    Object.entries(features).forEach(([featureName, feature]) => {
        featureLoaderLogger(`🔧 Inicjalizacja modułu "${featureName}"...`);

        try {
            feature.init();
            featureLoaderLogger(`✅ Zainicjalizowano moduł "${featureName}"`);
        } catch (e) {
            featureLoaderLogger(`❌ Błąd podczas inicjalizacji modułu "${featureName}"`);
            logError(e);
        }
    });

    // Commands
    log(`⚙️ Rejestrowanie komend...`);
    const refreshedCommandsCount = await commands.register(config.appId, config.token);
    log(`⚙️ Komendy zarejestrowane! (${refreshedCommandsCount} komend przeładowanych)`);

    log("✔️ Gotowy");
});

// noinspection JSIgnoredPromiseFromCall
discord.login(config.token);
