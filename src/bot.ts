import * as fs from "fs";
import * as path from "path";
import Persistence from "./persistence";
import Interactions, {InteractionHandlerCollection} from "./interactions";
import Commands from "./commands";
import Feature from "./feature";
import logger from "./logger";
import Services from "./services";
import Cron, {JobHandlerCollection} from "./cron";
import {Client, Events, GatewayIntentBits, Interaction, TextChannel} from "discord.js";

function logError(err: Error|Object|string) {
    console.error(`\n🛑 ${new Date().toLocaleString()}`);
    console.error(err);
    console.error("");
}

type ChannelsMapping = Record<string, TextChannel>;

interface BotConfig<SharedConfigType, PersistenceDataType> {
    featuresDirPath: string;
    servicesDefinitions?: string;
    persistence: Persistence<PersistenceDataType>;
    internalStorageFilePath: string;
    sharedConfig: SharedConfigType;
    namedChannels?: Record<string, string>;
    disabledFeatures?: string[];
    cleanseCommands?: boolean;
    auth: {
        token: string;
        appId: string;
    };
    additionalIntents?: number[];
}

type FeaturesCollection<SharedConfigType, PersistenceDataType> = Record<string, Feature<SharedConfigType, PersistenceDataType>>;

interface ServiceDefinition {
    path: string;
    parameters?: any[];
    serviceName?: string;
}

interface InternalStorageData {
    interactionHandlers: InteractionHandlerCollection;
    cronJobs: JobHandlerCollection;
}

export class Bot<SharedConfigType, PersistenceDataType> {
    private readonly token: string;
    discord: Client;
    persistence: Persistence<PersistenceDataType>;
    commands: Commands;
    interactions: Interactions;
    internalStorage: Persistence<InternalStorageData>;
    services: Services;
    cron: Cron;

    sharedConfig: SharedConfigType;
    disabledFeatures: Set<string>;
    channels: ChannelsMapping = {};

    constructor(init: BotConfig<SharedConfigType, PersistenceDataType>) {
        const log = logger("Bot", "blue");

        this.discord = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                ...(init.additionalIntents ?? [])
            ]
        });
        this.persistence = init.persistence;
        this.commands = new Commands();
        this.interactions = new Interactions();
        this.internalStorage = new Persistence<InternalStorageData>(
            init.internalStorageFilePath,
            {
                interactionHandlers: {},
                cronJobs: {}
            }
        );
        this.services = new Services();
        this.cron = new Cron();

        this.token = init.auth.token;
        this.sharedConfig = init.sharedConfig;
        this.disabledFeatures = new Set(init.disabledFeatures ?? []);

        this.discord.once(Events.ClientReady, async (readyClient: Client) => {
            log(`Logged in as ${readyClient.user.tag}`);
            log("Recovered persistence data:\n%o", this.persistence.data);
            log("Recovered internal state:\n%o", this.internalStorage.data);

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
            if (init.servicesDefinitions) {
                log("Initializing services...");
                await this.initServices(init.servicesDefinitions);
                log("Services initialized!");
            }

            // Features
            log("Initializing features...");
            this.initFeatures(init.featuresDirPath);
            log("Features initialized!");

            // Commands
            log(`Registering commands...`);
            const refreshedCommandsCount = await this.commands.register(init.auth.appId, init.auth.token, init.cleanseCommands ?? false);
            log(`Commands registered! (${refreshedCommandsCount} refreshed)`);

            // Cron
            log("Initializing cron...");
            this.initCron();
            log("Cron initialized!");

            log("Ready.");
        });
    }

    login() {
        const log = logger("login", "yellow");
        log("Logging in...");
        this.discord.login(this.token);
    }

    private async fetchNamedChannels(channels: Record<string, string>): Promise<void> {
        const log = logger("fetchNamedChannels", "green");

        for (const [internalName, channelId] of Object.entries(channels)) {
            const channel = await this.discord.channels.fetch(channelId) as TextChannel;
            log(`${internalName} (${channelId}) -> #${channel.name}`);
            this.channels[internalName] = channel;
        }
    }

    private async initServices(servicesDefinitionsFilePath: string) {
        const log = logger("initServices", "green");

        log(`Reading service definition from "${servicesDefinitionsFilePath}"`)
        const servicesDefinitions: ServiceDefinition[] = require(servicesDefinitionsFilePath);
        const pathPrefix = path.dirname(servicesDefinitionsFilePath);

        for (const definition of servicesDefinitions) {
            const modulePath = path.join(pathPrefix, definition.path);
            log(`Injecting: ${modulePath}`);

            try {
                const serviceClass = require(modulePath);
                const instance = definition.parameters ? new serviceClass(...definition.parameters) : new serviceClass();

                if (typeof instance["postConstruct"] === "function") {
                    await instance.postConstruct();
                }

                const injectedServiceName = this.services.inject(instance, definition.serviceName ?? null);
                log(`Injected ${injectedServiceName}`);
            } catch (e) {
                log(`Error while injecting service`);
                logError(e);
            }
        }
    }

    private initInteractions() {
        const log = logger("initInteractions", "green");

        this.interactions.handlersModifiedCallback = () => {
            const log = logger("interactions/handlersModifiedCallback", "yellow");

            log("Called");
            this.internalStorage.data.interactionHandlers = this.interactions.handlers;
            this.internalStorage.saveState();
        };

        log("Reading saved interactions");
        this.interactions.handlers = this.internalStorage.data.interactionHandlers;
    }

    private initFeatures(featuresDirPath: string) {
        const log = logger("initFeatures", "green");

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

    private initCron() {
        const log = logger("initCron", "green");

        this.cron.handlersModifiedCallback = () => {
            const log = logger("cron/handlersModifiedCallback", "yellow");

            log("Called");
            this.internalStorage.data.cronJobs = this.cron.handlers;
            this.internalStorage.saveState();
        };

        log("Reading saved cron jobs");

        Object.entries(this.internalStorage.data.cronJobs)
            .forEach(([handlerId, handlerData]) => {
                const executionTime = new Date(handlerData.executionTime);
                const now = new Date();

                if (executionTime <= now) {
                    log(`Invoking "${handlerData.type}" callback (${executionTime.toLocaleString()} <= ${now.toLocaleString()}). arg:\n%o`, handlerData.arg);
                    this.cron.invokeCallback(handlerData.type, handlerData.arg);
                    delete this.internalStorage.data.cronJobs[handlerId];
                    return;
                }

                log(`Recovering "${handlerId}" (to execute at ${executionTime.toLocaleString()}).`);
                this.cron.createJob(handlerData.type, executionTime, handlerData.arg, handlerId);
            });
        
        this.internalStorage.saveState();
    }
}
