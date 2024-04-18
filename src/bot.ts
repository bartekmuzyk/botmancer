import * as fs from "fs";
import * as path from "path";
import Persistence from "./persistence";
import Interactions from "./interactions";
import Commands from "./commands";
import Feature from "./feature";
import {InteractionHandlersCollection} from "./interactions";
import logger from "./logger";
import {Client, Events, GatewayIntentBits, Interaction, TextChannel} from "discord.js";

function logError(err: Error|Object|string) {
    console.error(`\n🛑 ${new Date().toLocaleString()}`);
    console.error(err);
    console.error("");
}

type ChannelsMapping = Record<string, import('discord.js').TextChannel>;

interface BotConfig<SharedConfigType, PersistenceDataType> {
    featuresDirPath: string;
    persistence: Persistence<PersistenceDataType>;
    interactionStorageFilePath: string;
    sharedConfig: SharedConfigType;
    namedChannels?: Record<string, string>;
    disabledFeatures?: string[];
    auth: {
        token: string;
        appId: string;
    };
}

type FeaturesCollection<SharedConfigType, PersistenceDataType> = Record<string, Feature<SharedConfigType, PersistenceDataType>>

export class Bot<SharedConfigType, PersistenceDataType> {
    private readonly token: string;
    persistence: Persistence<PersistenceDataType>;
    discord: Client;
    commands: Commands;
    interactions: Interactions;
    interactionStorage: Persistence<{interactionHandlers: InteractionHandlersCollection}>;
    sharedConfig: SharedConfigType;
    disabledFeatures: Set<string>;
    channels: ChannelsMapping;

    constructor(init: BotConfig<SharedConfigType, PersistenceDataType>) {
        const log = logger("main");

        // noinspection JSUnresolvedReference
        this.discord = new Client({intents: [GatewayIntentBits.Guilds]});
        this.persistence = init.persistence;
        this.commands = new Commands();
        this.interactions = new Interactions();
        // noinspection JSCheckFunctionSignatures
        this.interactionStorage = new Persistence<{interactionHandlers: InteractionHandlersCollection}>(
            init.interactionStorageFilePath,
            {interactionHandlers: {}}
        );

        this.token = init.auth.token;
        this.sharedConfig = init.sharedConfig;
        this.disabledFeatures = new Set(init.disabledFeatures ?? []);

        this.initInteractions();

        this.discord.once(Events.ClientReady, async (readyClient: Client) => {
            log(`✔️ Zalogowany jako ${readyClient.user.tag}`);
            log("💾 Załadowano stan:\n%o", this.persistence.data);
            log("💾 Załadowano dane interakcji:\n%o", this.interactionStorage.data);

            readyClient.on(Events.InteractionCreate, async (interaction: Interaction) => {
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

                    if (interaction.isRepliable()) {
                        if (interaction.deferred) {
                            await interaction.editReply({ content: friendlyMessage });
                        } else {
                            await interaction.reply({ content: friendlyMessage, ephemeral: true });
                        }
                    }
                }
            });

            // Channels
            log("🌍 Pobieranie kanałów...");
            await this.fetchNamedChannels(init.namedChannels ?? {});
            log(`🌍 Pobrano ${Object.keys(this.channels).length} kanałów!`);

            // Features
            this.initFeatures(init.featuresDirPath);

            // Commands
            log(`⚙️ Rejestrowanie komend...`);
            const refreshedCommandsCount = await this.commands.register(init.auth.appId, init.auth.token);
            log(`⚙️ Komendy zarejestrowane! (${refreshedCommandsCount} komend przeładowanych)`);

            log("✔️ Gotowy");
        });
    }

    login() {
        const log = logger("login");
        log("🔑 Logowanie...");
        // noinspection JSIgnoredPromiseFromCall
        this.discord.login(this.token);
    }

    private initInteractions() {
        this.interactions.handlers = this.interactionStorage.data.interactionHandlers;
        this.interactions.handlersModifiedCallback = () => {
            const log = logger("onHandlersModified");

            log("⚡ Wywołanie");
            this.interactionStorage.data.interactionHandlers = this.interactions.handlers;
            this.persistence.saveState();
        };
    }

    private initFeatures(featuresDirPath: string) {
        const log = logger("loadFeatures");

        const features: FeaturesCollection<SharedConfigType, PersistenceDataType> = fs.readdirSync(featuresDirPath)
            .reduce((acc: FeaturesCollection<SharedConfigType, PersistenceDataType>, featureName: string) => {
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

                const FeatureClass: typeof Feature = require(featureMainPath);
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

    private async fetchNamedChannels(channels: Record<string, string>): Promise<void> {
        const log = logger("fetchNamedChannels");

        for (const [internalName, channelId] of Object.entries(channels)) {
            // noinspection JSCheckFunctionSignatures
            const channel = await this.discord.channels.fetch(channelId) as TextChannel;
            log(`${internalName} (${channelId}) -> #${channel.name}`);
            // noinspection JSValidateTypes
            this.channels[internalName] = channel;
        }
    }
}
