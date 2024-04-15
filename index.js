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

/** @typedef {Record<string, import('discord.js').TextChannel>} ChannelsMapping */

/**
 * @template ConfigType
 */
class Bot {
    /** @type {Persistence} */
    persistence;

    /** @type {DiscordClient} */
    discord;

    /** @type {Commands} */
    commands;

    /** @type {Interactions} */
    interactions;

    /** @type {Object} */
    config;

    /** @param {Set<string>} */
    disabledFeatures;

    /** @type {ChannelsMapping} */
    channels;

    /**
     * @param featuresDirPath {string}
     * @param persistenceFilePath {string}
     * @param config {ConfigType}
     * @param disabledFeatures {string[]}
     * @param auth {{token: string, appId: string}}
     */
    constructor({
        featuresDir: featuresDirPath,
        persistenceFile: persistenceFilePath,
        config,
        disabledFeatures = [],
        auth
    }) {
        this.discord = new DiscordClient({intents: [GatewayIntentBits.Guilds]});
        this.persistence = new Persistence(persistenceFilePath);
        this.commands = new Commands();
        this.interactions = new Interactions();

        // Features init
        this.disabledFeatures = new Set(disabledFeatures);
        const features = this.#loadFeatures(featuresDirPath);

        // Bot init
        this.discord.once(DiscordEvents.ClientReady,  async readyClient => {
            const log = logger("main");

            log(`✔️ Zalogowany jako ${readyClient.user.tag}`);
            log("💾 Załadowano stan:\n%o", this.persistence.data);

            readyClient.on(DiscordEvents.InteractionCreate, async interaction => {
                log("🖱️ Odebrano jakąś interakcję!");
                try {
                    if (interaction.isButton() || interaction.isModalSubmit()) {
                        log("🖱️ Interakcja: przycisk/modal");
                        const handled = await this.interactions.emit(interaction);

                        if (!handled) {
                            log(`❌ Nie obsłużono interakcji ${interaction.id} - prawdopodobnie straciła ważność.`);
                            await interaction.reply({
                                content: "# ⏱️ Koniec czasu!\nNajwyraźniej minęło za dużo czasu i już nie możesz wykonać tej interakcji!",
                                ephemeral: true
                            });
                        }
                    } else if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                        log("🖱️ Interakcja: komenda");
                        await this.commands.handle(interaction);
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

            // TODO: additional init

            // Channels
            log("🌍 Pobieranie kanałów...");
            await this.#fetchConfigChannels();
            log(`🌍 Pobrano ${Object.keys(this.channels).length} kanałów!`);

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
    }

    /**
     * @param featuresDirPath {string}
     * @returns {Object<string, import('./features/feature')>}
     */
    #loadFeatures(featuresDirPath) {
        const log = logger("featureLoader");

        return fs.readdirSync(featuresDirPath).reduce((acc, featureName) => {
            const fullPath = path.join(featuresDirPath, featureName);
            if (!fs.statSync(fullPath).isDirectory()) return acc;

            if (this.disabledFeatures.includes(featureName)) {
                log(`❌ Pomijam moduł "${featureName}" - wyłączony w konfiguracji`);
                return acc;
            }

            const featureMainPath = path.join(fullPath, "main.js");

            if (!fs.existsSync(featureMainPath)) {
                log(`❌ Pomijam moduł "${featureName}" - brak pliku "main.js"`);
                return acc;
            }

            const FeatureClass = require(featureMainPath);
            acc[featureName] = new FeatureClass(discord, blogger, persistence, interactions, commands, config, channels);

            return acc;
        }, {});
    }

    #initInteractions() {
        this.interactions.handlers = this.persistence.data.interactionHandlers;
        this.interactions.handlersModifiedCallback = () => {
            const log = logger("onHandlersModified");

            log("⚡ Wywołanie")
            this.persistence.data.interactionHandlers = this.interactions.handlers;
            this.persistence.saveState();
        };
    }

    async #fetchConfigChannels() {
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
}

module.exports = Bot;