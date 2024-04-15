const uniqid = require("uniqid");
const dates = require("./dates");

/** @typedef {import("discord.js").ButtonInteraction|import("discord.js").ModalSubmitInteraction} DiscordInteraction */
/** @typedef {(arg: ?any, interaction: DiscordInteraction) => Promise<void>} InteractionHandler */
/**
 * @typedef {Object} InteractionHandlerData
 * @property {string} type
 * @property {?any} arg
 * @property {string} creationDate
 * @property {?number} timeToLive
 */

function cloneHandlers(obj) {
    return Object.entries(obj).reduce((acc, [k, v]) => {
        acc[k] = {...v};
        return acc;
    }, {});
}

class Interactions {
    /** @type {Object<string, InteractionHandlerData>} */
    #discordHandlers;

    /** @type {Object<string, InteractionHandler>} */
    #jsHandlers;

    /** @type {?(() => void)} */
    handlersModifiedCallback;

    constructor() {
        this.#discordHandlers = {};
        this.#jsHandlers = {};
        this.handlersModifiedCallback = null;
    }

    #cleanExpiredHandlers() {
        this.#discordHandlers = Object.entries(this.#discordHandlers).reduce((acc, [handlerId, handlerData]) => {
            if (handlerData.timeToLive) {
                const creationDate = dates.create(handlerData.creationDate);
                const expirationDate = dates.addTime(creationDate, handlerData.timeToLive * 60);

                if (expirationDate < dates.now()) {
                    return acc;
                }
            }

            acc[handlerId] = handlerData;

            return acc;
        }, {});
    }

    #onHandlersModified() {
        this.#cleanExpiredHandlers();

        if (this.handlersModifiedCallback) {
            this.handlersModifiedCallback();
        }
    }

    /**
     * @param interactionType {string}
     * @param cb {InteractionHandler}
     */
    on(interactionType, cb) {
        this.#jsHandlers[interactionType] = cb;
    }

    /**
     * @param type {string}
     * @param arg {?any}
     * @param timeToLive {?number} in minutes
     * @returns {string}
     */
    createHandler(type, arg = null, timeToLive = null) {
        const handlerId = uniqid(`${type}:`);
        this.#discordHandlers[handlerId] = {
            type,
            arg,
            creationDate: new Date().toJSON(),
            timeToLive
        };
        this.#onHandlersModified();

        return handlerId;
    }

    /**
     * @param ids {string}
     */
    removeHandlers(...ids) {
        for (const id of ids) {
            delete this.#discordHandlers[id];
        }

        this.#onHandlersModified();
    }

    /**
     * @param id {string}
     * @param newArg {?any}
     */
    setHandlerArgument(id, newArg) {
        this.#discordHandlers[id].arg = newArg;
        this.#onHandlersModified();
    }

    /**
     * @param interaction {DiscordInteraction}
     * @returns {Promise<boolean>}
     */
    async emit(interaction) {
        const handlerData = this.#discordHandlers[interaction.customId];
        const callback = this.#jsHandlers[handlerData.type];

        if (callback) {
            await callback(handlerData.arg, interaction);
            return true;
        } else {
            //throw new Error(`Callback for interaction of type ${handlerData.type} (${interaction.customId}, arg = ${handlerData.arg}) doesn't exist.`);
            return false;
        }
    }

    /**
     * @returns {Object<string, InteractionHandlerData>}
     */
    get handlers() {
        return cloneHandlers(this.#discordHandlers);
    }

    set handlers(value) {
        this.#discordHandlers = cloneHandlers(value);
        this.#cleanExpiredHandlers();
    }
}

module.exports = Interactions;
