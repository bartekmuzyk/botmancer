const {Feature} = require("../../../dist");
const {SlashCommandBuilder, channelMention, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

module.exports = class extends Feature {
    init() {
        this.bot.commands.createSlash({
            definition: new SlashCommandBuilder()
                .setName("test1")
                .setDescription("feature test1"),
            execute: async interaction => {
                const handlerId = this.bot.interactions.createHandler("test1", interaction.member.user.displayName, 10);

                await interaction.reply({
                    content: `oto kanał: ${channelMention(this.bot.channels["test"].id)}`,
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(handlerId)
                                    .setStyle(ButtonStyle.Primary)
                                    .setLabel("kliknij!")
                            )
                    ]
                });
            }
        });

        this.bot.interactions.on("test1", async (arg, interaction) => {
            await interaction.reply({ content: `arg = "${arg}"` });
        });
    }
}
