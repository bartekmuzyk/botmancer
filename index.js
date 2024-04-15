const fs = require("fs");
const path = require("path");
const {Client, Events, GatewayIntentBits} = require("discord.js");
const Persistence = require("./persistence");
const Interactions = require("./interactions");
const Commands = require("./commands");
const Feature = require("./feature");
const logger = require("./logger");

function logError(err) {
    console.error(`\n🛑 ${new Date().toLocaleString()}`);
    console.error(err);
    console.error("");
}

/** @typedef {Record<string, import('discord.js').TextChannel>} ChannelsMapping */

/**
 * @template SharedConfigType, PersistenceDataType
 */
class Bot {
    /** @type {Persistence<PersistenceDataType>} */
    persistence;

    /** @type {Client} */
    discord;

    /** @type {Commands} */
    commands;

    /** @type {Interactions} */
    interactions;

    /** @type {Persistence<Object<string, InteractionHandlerData>>} */
    interactionStorage;

    /** @type {SharedConfigType} */
    sharedConfig;

    /** @type {Set<string>} */
    disabledFeatures;

    /** @type {ChannelsMapping} */
    channels;

    /**
     * @param featuresDirPath {string}
     * @param persistence {Persistence<PersistenceDataType>}
     * @param interactionStorageFilePath {string}
     * @param sharedConfig {SharedConfigType}
     * @param namedChannels {?Object<string, string>}
     * @param disabledFeatures {?(string[])}
     * @param auth {{token: string, appId: string}}
     */
    constructor({
        featuresDirPath, persistence, interactionStorageFilePath, sharedConfig,
        namedChannels = null, disabledFeatures = null, auth
    }) {
        const log = logger("main");

        // noinspection JSUnresolvedReference
        this.discord = new Client({intents: [GatewayIntentBits.Guilds]});
        this.persistence = persistence;
        this.commands = new Commands();
        this.interactions = new Interactions();
        // noinspection JSCheckFunctionSignatures
        this.interactionStorage = new Persistence(interactionStorageFilePath, {});

        this.sharedConfig = sharedConfig;
        this.disabledFeatures = new Set(disabledFeatures ?? []);

        this.#initInteractions();

        this.discord.once(Events.ClientReady, async readyClient => {
            log(`✔️ Zalogowany jako ${readyClient.user.tag}`);
            log("💾 Załadowano stan:\n%o", this.persistence.data);
            log("💾 Załadowano dane interakcji:\n%o", this.interactionStorage.data);

            readyClient.on(Events.InteractionCreate, async interaction => {
                log("🖱️ Odebrano jakąś interakcję!");

                try {
                    if (interaction.isButton() || interaction.isModalSubmit()) {
                        log("🖱️ Interakcja: przycisk/modal");
                        const handled = await this.interactions.emit(interaction);

                        if (!handled) {
                            log(`❌ Nie obsłużono interakcji ${interaction.id} - prawdopodobnie straciła ważność.`);
                            await interaction.reply({
                                content: "# ⏱️ Koniec czasu!\nNajwyraźniej minęło za dużo czasu i już nie możesz wykonać tej interakcji.",
                                ephemeral: true
                            });
                        }
                    } else if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                        log("🖱️ Interakcja: komenda");
                        await this.commands.handle(interaction);
                    }
                } catch (e) {
                    logError(e);
                    const friendlyMessage = "# Sorka, coś się stało...\nWydarzyło się coś niespodziewanego. **Powiadom o tym Bartka!**";

                    try {
                        await interaction.reply({ content: friendlyMessage, ephemeral: true });
                    } catch (e) {
                        await interaction.editReply({ content: friendlyMessage });
                    }
                }
            });

            // Channels
            log("🌍 Pobieranie kanałów...");
            await this.#fetchNamedChannels(namedChannels ?? {});
            log(`🌍 Pobrano ${Object.keys(this.channels).length} kanałów!`);

            // Features
            this.#initFeatures(featuresDirPath);

            // Commands
            log(`⚙️ Rejestrowanie komend...`);
            const refreshedCommandsCount = await this.commands.register(auth.appId, auth.token);
            log(`⚙️ Komendy zarejestrowane! (${refreshedCommandsCount} komend przeładowanych)`);

            log("✔️ Gotowy");
        });

        log("🔑 Logowanie...");
        // noinspection JSIgnoredPromiseFromCall
        this.discord.login(auth.token);
    }

    #initInteractions() {
        this.interactions.handlers = this.persistence.data.interactionHandlers;
        this.interactions.handlersModifiedCallback = () => {
            const log = logger("onHandlersModified");

            log("⚡ Wywołanie");
            this.persistence.data.interactionHandlers = this.interactions.handlers;
            this.persistence.saveState();
        };
    }

    /**
     * @param featuresDirPath {string}
     */
    #initFeatures(featuresDirPath) {
        const log = logger("loadFeatures");

        /** @type {Object<string, Feature>} */
        const features = fs.readdirSync(featuresDirPath).reduce((acc, featureName) => {
            const fullPath = path.join(featuresDirPath, featureName);
            if (!fs.statSync(fullPath).isDirectory()) return acc;

            if (this.disabledFeatures.has(featureName)) {
                log(`❌ Pomijam moduł "${featureName}" - wyłączony w konfiguracji`);
                return acc;
            }

            const featureMainPath = path.join(fullPath, "main.js");

            if (!fs.existsSync(featureMainPath)) {
                log(`❌ Pomijam moduł "${featureName}" - brak pliku "main.js"`);
                return acc;
            }

            const FeatureClass = require(featureMainPath);
            acc[featureName] = new FeatureClass(this);

            return acc;
        }, {});

        Object.entries(features).forEach(([featureName, feature]) => {
            log(`🔧 Inicjalizacja modułu "${featureName}"...`);

            try {
                feature.init();
                log(`✅ Zainicjalizowano moduł "${featureName}"`);
            } catch (e) {
                log(`❌ Błąd podczas inicjalizacji modułu "${featureName}"`);
                logError(e);
            }
        });
    }

    /**
     * @param channels {Object<string, string>}
     * @returns {Promise<void>}
     */
    async #fetchNamedChannels(channels) {
        const log = logger("fetchNamedChannels");

        for (const [internalName, channelId] of Object.entries(channels)) {
            // noinspection JSCheckFunctionSignatures
            const channel = await this.discord.channels.fetch(channelId);
            log(`${internalName} (${channelId}) -> #${channel.name}`);
            // noinspection JSValidateTypes
            this.channels[internalName] = channel;
        }
    }
}

module.exports = {Bot, Persistence, Feature};