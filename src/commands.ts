import logger, {Logger} from "./logger";
import {
    ChatInputCommandInteraction,
    Collection,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    REST,
    Routes,
    SlashCommandBuilder
} from "discord.js";
import {AnyCommandInteraction, AnyContextMenuInteraction} from "./interactions";

type SlashCommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;
type ContextMenuCommandHandler = (interaction: AnyContextMenuInteraction) => Promise<void>;

interface CommandData<BuilderType, HandlerType> {
    definition: BuilderType;
    execute: HandlerType;
}

type SlashCommandData = CommandData<SlashCommandBuilder, SlashCommandHandler>
type ContextMenuCommandData = CommandData<ContextMenuCommandBuilder, ContextMenuCommandHandler>;

export default class Commands {
    private slashCommands: Collection<string, SlashCommandData>;
    private contextMenuCommands: Collection<string, ContextMenuCommandData>
    private readonly logger: Logger;

    constructor() {
        this.slashCommands = new Collection();
        this.contextMenuCommands = new Collection();
        this.logger = logger("Commands", "gray")
    }

    createSlash(data: SlashCommandData) {
        const name = data.definition.name;
        this.logger(`Creating slash command /${name}`);
        this.slashCommands.set(name, data);
    }

    createInContextMenu(data: ContextMenuCommandData) {
        const name = data.definition.name;
        this.logger(`Creating context menu command "${name}"`);
        this.contextMenuCommands.set(name, data);
    }

    async register(clientId: string, token: string, cleanse: boolean = false): Promise<number> {
        this.logger("Registering...");

        const rest = new REST().setToken(token);

        if (cleanse) {
            this.logger("Cleansing first...");
            await rest.put(Routes.applicationCommands(clientId), { body: [] });
            this.logger("Cleansing complete!");
        }

        const restCommands = [
            ...this.slashCommands.values(),
            ...this.contextMenuCommands.values()
        ].map(data => data.definition.toJSON());
        const result = await rest.put(Routes.applicationCommands(clientId), {body: restCommands}) as {length: number};

        return result.length;
    }

    async handle(interaction: AnyCommandInteraction): Promise<void> {
        const cmd = interaction.commandName;

        if (interaction.isContextMenuCommand()) {
            this.logger(`Executing menu command "${cmd}"`)
            const data = this.contextMenuCommands.get(cmd);

            if (!data) {
                this.logger(`Couldn't find context menu command "${cmd}"`);
                return;
            }

            await data.execute(interaction);
        } else if (interaction.isChatInputCommand()) {
            this.logger(`Executing slash command /${cmd}`);
            const data = this.slashCommands.get(cmd);

            if (!data) {
                this.logger(`Couldn't find slash command /${cmd}`);
                return;
            }

            await data.execute(interaction);
        }
    }
}
