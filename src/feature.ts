import {AnyInteraction} from "./interactions";
import {Bot} from "./index";
import {GuildMemberRoleManager} from "discord.js";

export default class Feature<SharedConfigType, PersistenceDataType> {
    bot: Bot<SharedConfigType, PersistenceDataType>;

    constructor(bot: Bot<SharedConfigType, PersistenceDataType>) {
        this.bot = bot;
    }

    interactionAuthorHasRole(interaction: AnyInteraction, roleId: string): boolean {
        return (interaction.member.roles as GuildMemberRoleManager).cache.some(role => role.id === roleId);
    }

    featureDisabled(featureName: string): boolean {
        return this.bot.disabledFeatures.has(featureName);
    }

    init() {
        throw new Error("init not implemented!");
    }
}
