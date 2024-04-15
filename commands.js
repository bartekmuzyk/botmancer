const {
    CommandInteraction,
    ContextMenuCommandInteraction,
    MessageContextMenuCommandInteraction,
    SlashCommandBuilder,
    ContextMenuCommandBuilder,
    Collection,
    REST,
    Routes
} = require("discord.js");
const logger = require("./logger");

/** @typedef {(interaction: CommandInteraction) => Promise<void>} CommandInteractionHandler */
/** @typedef {(interaction: ContextMenuCommandInteraction|MessageContextMenuCommandInteraction) => Promise<void>} ContextMenuCommandInteractionHandler */

/**
 * @typedef {Object} CommandData
 * @property {SlashCommandBuilder|ContextMenuCommandBuilder} definition
 * @property {CommandInteractionHandler|ContextMenuCommandInteractionHandler} execute
 */

class Commands {
    /** @type {Collection<string, CommandData>} */
    #commands;

    #logger;

    constructor() {
        // noinspection JSValidateTypes
        this.#commands = new Collection();
        this.#logger = logger("Commands")
    }

    /**
     * @param definition {SlashCommandBuilder}
     * @param execute {CommandInteractionHandler}
     */
    create(definition, execute) {
        this.#logger(`Tworzę /${definition.name}`);
        this.#commands.set(definition.name, {definition, execute});
    }

    /**
     * @param definition {ContextMenuCommandBuilder}
     * @param execute {ContextMenuCommandInteractionHandler}
     */
    createInContextMenu(definition, execute) {
        this.#logger(`Tworzę opcję w menu kontekstowym "${definition.name}"`);
        this.#commands.set(definition.name, {definition, execute});
    }

    /**
     * @param clientId {string}
     * @param token {string}
     * @returns {Promise<number>} The number of refreshed commands
     */
    async register(clientId, token) {
        this.#logger("Rejestruję...");

        const rest = new REST().setToken(token);
        const restCommands = [...this.#commands.values()].map(data => data.definition.toJSON());
        const result = await rest.put(Routes.applicationCommands(clientId), {body: restCommands});

        return result.length;
    }

    /**
     * @param interaction {CommandInteraction}
     * @returns {Promise<void>}
     */
    async handle(interaction) {
        const cmd = interaction.commandName;

        this.#logger(`Wykonuję /${cmd}`);

        await this.#commands.get(cmd)?.execute(interaction);
    }
}

module.exports = Commands;
