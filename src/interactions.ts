import * as uniqid from "uniqid"
import {
    ButtonInteraction,
    ChatInputCommandInteraction, ContextMenuCommandInteraction,
    MessageContextMenuCommandInteraction, ModalSubmitInteraction,
    UserContextMenuCommandInteraction
} from "discord.js";

export type ButtonOrModalInteraction = ButtonInteraction | ModalSubmitInteraction;
export type AnyContextMenuInteraction = ContextMenuCommandInteraction | MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction;
export type AnyCommandInteraction = AnyContextMenuInteraction | ChatInputCommandInteraction;
export type AnyInteraction = AnyCommandInteraction | ButtonOrModalInteraction;

export type InteractionHandler = (arg: any|null, interaction: ButtonOrModalInteraction) => Promise<void>;
export type InteractionHandlerData = {type: string, arg: any|null, creationDate: string, timeToLive: number|null};
export type InteractionHandlersCollection = Record<string, InteractionHandlerData>

function cloneHandlers(obj: InteractionHandlersCollection) {
    return Object.entries(obj).reduce((acc, [k, v]) => {
        acc[k] = {...v};
        return acc;
    }, {});
}

export default class Interactions {
    private discordHandlers: InteractionHandlersCollection;
    private readonly jsHandlers: Record<string, InteractionHandler>;
    handlersModifiedCallback: (() => void)|null;

    constructor() {
        this.discordHandlers = {};
        this.jsHandlers = {};
        this.handlersModifiedCallback = null;
    }

    private cleanExpiredHandlers() {
        this.discordHandlers = Object.entries(this.discordHandlers).reduce((acc, [handlerId, handlerData]) => {
            if (handlerData.timeToLive) {
                const creationDate = new Date(handlerData.creationDate);
                const expirationDate = new Date(creationDate.getTime() + (handlerData.timeToLive * 1000))

                if (expirationDate < new Date()) {
                    return acc;
                }
            }

            acc[handlerId] = handlerData;

            return acc;
        }, {});
    }

    private onHandlersModified() {
        this.cleanExpiredHandlers();

        if (this.handlersModifiedCallback) {
            this.handlersModifiedCallback();
        }
    }

    on(interactionType: string, cb: InteractionHandler) {
        this.jsHandlers[interactionType] = cb;
    }

    createHandler(type: string, arg: any|null = null, timeToLive: number|null = null): string {
        const handlerId = uniqid(`${type}:`);
        this.discordHandlers[handlerId] = {
            type,
            arg,
            creationDate: new Date().toJSON(),
            timeToLive
        };
        this.onHandlersModified();

        return handlerId;
    }

    removeHandlers(...ids: string[]) {
        for (const id of ids) {
            delete this.discordHandlers[id];
        }

        this.onHandlersModified();
    }

    setHandlerArgument(id: string, newArg: any|null) {
        this.discordHandlers[id].arg = newArg;
        this.onHandlersModified();
    }

    async emit(interaction: ButtonOrModalInteraction): Promise<boolean> {
        const handlerData = this.discordHandlers[interaction.customId];

        if (!handlerData) {
            return false;
        }

        await this.jsHandlers[handlerData.type](handlerData.arg, interaction);
        return true;
    }

    get handlers(): InteractionHandlersCollection {
        return cloneHandlers(this.discordHandlers);
    }

    set handlers(value) {
        this.discordHandlers = cloneHandlers(value);
        this.onHandlersModified();
    }
}
