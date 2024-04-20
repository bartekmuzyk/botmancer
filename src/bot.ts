import * as fs from "fs";
import * as path from "path";
import Persistence from "./persistence";
import Interactions from "./interactions";
import Commands from "./commands";
import Feature from "./feature";
import {InteractionHandlersCollection} from "./interactions";
import logger from "./logger";
import {Client, Events, GatewayIntentBits, Interaction, TextChannel} from "discord.js";
import Services from "./services";

function logError(err: Error|Object|string) {
    console.error(`\n🛑 ${new Date().toLocaleString()}`);
    console.error(err);
    console.error("");
}

type ChannelsMapping = Record<string, import('discord.js').TextChannel>;

interface BotConfig<SharedConfigType, PersistenceDataType> {
    featuresDirPath: string;
    servicesDefinitions?: string;
    persistence: Persistence<PersistenceDataType>;
    interactionStorageFilePath: string;
    sharedConfig: SharedConfigType;
    namedChannels?: Record<string, string>;
    disabledFeatures?: string[];
    cleanseCommands?: boolean;
    auth: {
        token: string;
        appId: string;
    };
}

type FeaturesCollection<SharedConfigType, PersistenceDataType> = Record<string, Feature<SharedConfigType, PersistenceDataType>>;

interface ServiceDefinition {
    path: string;
    parameters?: any[];
    serviceName?: string;
}

export class Bot<SharedConfigType, PersistenceDataType> {
    private readonly token: string;
    discord: Client;
    persistence: Persistence<PersistenceDataType>;
    commands: Commands;
    interactions: Interactions;
    interactionStorage: Persistence<{interactionHandlers: InteractionHandlersCollection}>;
    services: Services;
    sharedConfig: SharedConfigType;
    disabledFeatures: Set<string>;
    channels: ChannelsMapping = {};

    constructor(init: BotConfig<SharedConfigType, PersistenceDataType>) {
        const log = logger("Bot");

        this.discord = new Client({intents: [GatewayIntentBits.Guilds]});
        this.persistence = init.persistence;
        this.commands = new Commands();
        this.interactions = new Interactions();
        this.interactionStorage = new Persistence<{interactionHandlers: InteractionHandlersCollection}>(
            init.interactionStorageFilePath,
            {interactionHandlers: {}}
        );
        this.services = new Services();

        this.token = init.auth.token;
        this.sharedConfig = init.sharedConfig;
        this.disabledFeatures = new Set(init.disabledFeatures ?? []);

        this.discord.once(Events.ClientReady, async (readyClient: Client) => {
            log(`Logged in as ${readyClient.user.tag}`);
            log("Loaded state:\n%o", this.persistence.data);
            log("Loaded interaction data:\n%o", this.interactionStorage.data);

            readyClient.on(Events.InteractionCreate, async (interaction: Interaction) => {
                log("Received an interaction!");

                try {
                    if (interaction.isButton() || interaction.isModalSubmit()) {
                        log("Interaction: Button/Modal");
                        const handled = await this.interactions.emit(interaction);

                        if (!handled) {
                            log(`Rejected interaction ${interaction.id} - it probably timed out.`);
                            await interaction.reply({
                                content: "# ⏱️ Koniec czasu!\nNajwyraźniej minęło za dużo czasu i już nie możesz wykonać tej interakcji.",
                                ephemeral: true
                            });
                        }
                    } else if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                        log("Interaction: Command");
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

            // Interactions
            log("Initializing interactions...");
            this.initInteractions();
            log("Interactions initialized!");

            // Channels
            log("Fetching channels...");
            await this.fetchNamedChannels(init.namedChannels ?? {});
            log(`Fetched ${Object.keys(this.channels).length} channels!`);

            // Services
            log("Initializing services...");
            this.initServices(init.servicesDefinitions);
            log("Services initialized!");

            // Features
            log("Initializing features...");
            this.initFeatures(init.featuresDirPath);
            log("Features initialized!");

            // Commands
            log(`Registering commands...`);
            const refreshedCommandsCount = await this.commands.register(init.auth.appId, init.auth.token, init.cleanseCommands ?? false);
            log(`Commands registered! (${refreshedCommandsCount} refreshed)`);

            log("Ready");
        });
    }

    login() {
        const log = logger("login");
        log("Logging in...");
        this.discord.login(this.token);
    }

    private initServices(servicesDefinitionsFilePath: string) {
        const log = logger("initServices");

        log(`Reading service definition from "${servicesDefinitionsFilePath}"`)
        const servicesDefinitions: ServiceDefinition[] = require(servicesDefinitionsFilePath);
        const pathPrefix = path.dirname(servicesDefinitionsFilePath);

        servicesDefinitions.forEach(definition => {
            const modulePath = path.join(pathPrefix, definition.path);
            log(`Injecting: ${modulePath}`);

            try {
                const serviceClass = require(modulePath);
                const instance = definition.parameters ? new serviceClass(...definition.parameters) : new serviceClass();

                const injectedServiceName = this.services.inject(instance, definition.serviceName ?? null);
                log(`Injected ${injectedServiceName}`);
            } catch (e) {
                log(`Error while injecting service`);
                logError(e);
            }
        });
    }

    private initInteractions() {
        const log = logger("initInteractions");

        this.interactions.handlersModifiedCallback = () => {
            const log = logger("handlersModifiedCallback");

            log("Called");
            this.interactionStorage.data.interactionHandlers = this.interactions.handlers;
            this.interactionStorage.saveState();
        };

        log("Reading saved interactions");
        this.interactions.handlers = this.interactionStorage.data.interactionHandlers;
    }

    private initFeatures(featuresDirPath: string) {
        const log = logger("initFeatures");

        const features: FeaturesCollection<SharedConfigType, PersistenceDataType> = fs.readdirSync(featuresDirPath)
            .reduce((acc: FeaturesCollection<SharedConfigType, PersistenceDataType>, featureName: string) => {
                const fullPath = path.join(featuresDirPath, featureName);
                if (!fs.statSync(fullPath).isDirectory()) return acc;

                if (this.disabledFeatures.has(featureName)) {
                    log(`Skipping feature "${featureName}" - disabled in init`);
                    return acc;
                }

                const featureMainPath = path.join(fullPath, "main.js");

                if (!fs.existsSync(featureMainPath)) {
                    log(`Skipping feature "${featureName}" - no "main.js" file found`);
                    return acc;
                }

                const FeatureClass: typeof Feature = require(featureMainPath);
                acc[featureName] = new FeatureClass(this);

                return acc;
            }, {});

        Object.entries(features).forEach(([featureName, feature]) => {
            log(`Initializing feature "${featureName}"...`);

            try {
                feature.init();
            } catch (e) {
                log(`Error while initializing feature "${featureName}"`);
                logError(e);
            }
        });
    }

    private async fetchNamedChannels(channels: Record<string, string>): Promise<void> {
        const log = logger("fetchNamedChannels");

        for (const [internalName, channelId] of Object.entries(channels)) {
            const channel = await this.discord.channels.fetch(channelId) as TextChannel;
            log(`${internalName} (${channelId}) -> #${channel.name}`);
            this.channels[internalName] = channel;
        }
    }
}
