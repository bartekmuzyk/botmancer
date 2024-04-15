class Feature {
    /** @type {import('./index')} */
    bot;

    constructor(bot) {
        this.bot = bot;
    }

    /**
     * @param interaction
     * @param roleId {string}
     * @returns {boolean}
     */
    interactionAuthorHasRole(interaction, roleId) {
        // noinspection JSIncompatibleTypesComparison
        return interaction.member.roles.cache.some(role => role.id === roleId);
    }

    /**
     * @param featureName {string}
     * @returns {boolean}
     */
    featureDisabled(featureName) {
        return this.bot.disabledFeatures.has(featureName);
    }

    init() {
        throw new Error("init not implemented!");
    }
}

module.exports = Feature;
