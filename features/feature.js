class Feature {
    /** @type {import('discord.js').Client} */
    discord;
    /** @type {import('../blogger').Blogger} */
    blogger;
    /** @type {import('../persistence').Persistence} */
    persistence;
    /** @type {import('../interactions').Interactions} */
    interactions;
    /** @type {import('../commands').Commands} */
    commands;
    /** @type {typeof import('../config.dist.json')} */
    config;
    /** @type {import('../index').ChannelsMapping} */
    channels;

    constructor(discord, blogger, persistence, interactions, commands, config, channels) {
        this.discord = discord;
        this.blogger = blogger;
        this.persistence = persistence;
        this.interactions = interactions;
        this.commands = commands;
        this.config = config;
        this.channels = channels;
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

    featureDisabled(featureName) {
        return this.config.disabledFeatures.includes(featureName);
    }

    init() {
        throw new Error("init not implemented!");
    }
}

module.exports = Feature;
