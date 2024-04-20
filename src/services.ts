export default class Services {
    private services: Record<string, Object> = {};

    inject(instance: Object, overrideName: string | null = null): string {
        const serviceName = overrideName ?? instance.constructor.name;

        if (this.services.hasOwnProperty(serviceName)) {
            throw new Error(`Tried to register a service named "${serviceName}" twice.`);
        }

        this.services[serviceName] = instance;

        return serviceName;
    }

    get<T>(serviceName: string): T {
        if (!this.services.hasOwnProperty(serviceName)) {
            throw new Error(`Service named "${serviceName}" doesn't exist.`);
        }

        return this.services[serviceName] as T;
    }
}
