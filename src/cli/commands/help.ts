import type { CommandDef } from "citty";
import { renderUsage } from "citty";
import type { ArgsDef } from "citty";

export interface HelpCommandArgs extends ArgsDef {
  command: {
    type: "positional";
    description: "Command name to show help for";
    required: false;
  };
}

export const helpCommand: CommandDef<HelpCommandArgs> = {
  meta: {
    name: "help",
    description: "Show help for a command",
  },
  args: {
    command: {
      type: "positional",
      description: "Command name to show help for",
      required: false,
    },
  },
  run: async (ctx) => {
    const { args, cmd } = ctx;
    const commandName = args._[0] ?? args.command;

    if (commandName) {
      // Find the subcommand and show its usage
      const parentCmd = cmd;
      const subCommands = parentCmd.subCommands
        ? typeof parentCmd.subCommands === "function"
          ? parentCmd.subCommands()
          : parentCmd.subCommands
        : {};

      // Get the subcommand (could be a promise or function)
      let subCommand = subCommands[commandName];
      if (subCommand) {
        if (typeof subCommand === "function") {
          subCommand = subCommand();
        }
        if (subCommand instanceof Promise) {
          subCommand = await subCommand;
        }
        const usage = await renderUsage(subCommand, parentCmd);
        console.log(usage);
      } else {
        console.error(`Unknown command: ${commandName}`);
        const mainUsage = await renderUsage(parentCmd);
        console.log(mainUsage);
      }
    } else {
      // Show main usage
      const usage = await renderUsage(cmd);
      console.log(usage);
    }
  },
};
