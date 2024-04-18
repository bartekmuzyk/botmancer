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
        this.logger = logger("Commands")
    }

    createSlash(data: SlashCommandData) {
        const name = data.definition.name;
        this.logger(`Tworzę /${name}`);
        this.slashCommands.set(name, data);
    }

    createInContextMenu(data: ContextMenuCommandData) {
        const name = data.definition.name;
        this.logger(`Tworzę opcję w menu kontekstowym "${name}"`);
        this.contextMenuCommands.set(name, data);
    }

    async register(clientId: string, token: string): Promise<number> {
        this.logger("Rejestruję...");

        const rest = new REST().setToken(token);
        const restCommands = [...this.slashCommands.values()].map(data => data.definition.toJSON());
        const result = await rest.put(Routes.applicationCommands(clientId), {body: restCommands}) as {length: number};

        return result.length;
    }

    async handle(interaction: AnyCommandInteraction): Promise<void> {
        const cmd = interaction.commandName;

        this.logger(interaction.isContextMenuCommand() ? `Wykonuję opcję "${cmd}"` : `Wykonuję /${cmd}`);

        if (interaction.isContextMenuCommand()) {
            const data = this.contextMenuCommands.get(cmd);

            if (!data) {
                this.logger(`Nie znaleziono polecenia menu kontekstowego "${cmd}"`);
                return;
            }

            await data.execute(interaction);
        } else if (interaction.isChatInputCommand()) {
            const data = this.slashCommands.get(cmd);

            if (!data) {
                this.logger(`Nie znaleziono komendy /${cmd}`);
                return;
            }

            await data.execute(interaction);
        }
    }
}
