import * as colors from "colors/safe";

const logger = (sectionName: string, color: string = "white") => (message: string, ...args: any[]) => console.log(colors.bold[color](`[${sectionName}]`) + ` ${message}`, ...args);
export type Logger = ReturnType<typeof logger>;
export default logger;