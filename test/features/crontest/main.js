const {Feature} = require("../../../dist");
const {SlashCommandBuilder} = require("discord.js");

module.exports = class extends Feature {
    init() {
        this.bot.commands.createSlash({
            definition: new SlashCommandBuilder()
                .setName("crontest")
                .setDescription("cron job test")
                .addIntegerOption(option => option.setName("seconds")
                    .setDescription("Number of seconds to delay")
                    .setRequired(true)
                    .setMinValue(1)
                )
                .addStringOption(option => option.setName("message")
                    .setDescription("Message to apply")
                    .setRequired(true)
                    .setMinLength(1)
                ),
            execute: async interaction => {
                const at = new Date();
                at.setSeconds(at.getSeconds() + interaction.options.getInteger("seconds"));

                const jobId = this.bot.cron.createJob("testing", at, interaction.options.getString("message"));

                await interaction.reply(jobId);
            }
        });

        this.bot.cron.on("testing", async arg => {
            await this.bot.channels["test"].send(arg);
        });
    }
}
