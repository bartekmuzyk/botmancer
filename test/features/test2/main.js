const {Feature} = require("../../../dist");
const {ContextMenuCommandBuilder, ApplicationCommandType} = require("discord.js");

module.exports = class extends Feature {
    init() {
        this.bot.commands.createInContextMenu({
            definition: new ContextMenuCommandBuilder()
                .setName("test2")
                .setType(ApplicationCommandType.Message)
                .setDMPermission(false),
            execute: async interaction => {
                await interaction.reply(`oto wiadomość: ${interaction.targetMessage.url}`);
            }
        });
    }
}
