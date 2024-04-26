import * as uniqid from "uniqid";
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

export type InteractionCallback = (arg: any|null, interaction: ButtonOrModalInteraction) => Promise<void>;
export type InteractionHandler = {type: string, arg: any|null, creationDate: string, timeToLive: number|null};
export type InteractionHandlerCollection = Record<string, InteractionHandler>

export default class Interactions {
    private _handlers: InteractionHandlerCollection;
    private readonly callbacks: Record<string, InteractionCallback>;
    handlersModifiedCallback: (() => void)|null;

    constructor() {
        this._handlers = {};
        this.callbacks = {};
        this.handlersModifiedCallback = null;
    }

    private cleanExpiredHandlers() {
        this._handlers = Object.entries(this._handlers).reduce((acc, [handlerId, handlerData]) => {
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

    on(interactionType: string, cb: InteractionCallback) {
        this.callbacks[interactionType] = cb;
    }

    createHandler(type: string, arg: any|null = null, timeToLive: number|null = null): string {
        const handlerId = uniqid(`${type}:`);
        this._handlers[handlerId] = {
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
            delete this._handlers[id];
        }

        this.onHandlersModified();
    }

    setHandlerArgument(id: string, newArg: any|null) {
        this._handlers[id].arg = newArg;
        this.onHandlersModified();
    }

    async emit(interaction: ButtonOrModalInteraction): Promise<boolean> {
        const handlerData = this._handlers[interaction.customId];

        if (!handlerData) {
            return false;
        }

        await this.callbacks[handlerData.type](handlerData.arg, interaction);
        return true;
    }

    get handlers(): InteractionHandlerCollection {
        return structuredClone(this._handlers);
    }

    set handlers(value: InteractionHandlerCollection) {
        this._handlers = structuredClone(value);
        this.onHandlersModified();
    }
}
