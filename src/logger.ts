const logger = (sectionName: string) => (message: string, ...args: any[]) => console.log(`[${sectionName}] ${message}`, ...args);
export type Logger = ReturnType<typeof logger>;
export default logger;