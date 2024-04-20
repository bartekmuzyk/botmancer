const {Feature} = require("../../../dist");
const {SlashCommandBuilder, channelMention, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

module.exports = class extends Feature {
    /** @type {import('../../services/testing')} */
    testingService;

    init() {
        this.testingService = this.bot.services.get("FooBarService");

        this.bot.commands.createSlash({
            definition: new SlashCommandBuilder()
                .setName("service")
                .setDescription("test services"),
            execute: async interaction => {
                const returnValue = this.testingService.foo();

                await interaction.reply({ content: returnValue.toString(), ephemeral: true });
            }
        });
    }
}
