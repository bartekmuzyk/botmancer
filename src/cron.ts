import * as uniqid from "uniqid";
import * as schedule from "node-schedule";

export type JobCallback = (arg: any|null) => Promise<void>;
export type JobHandler = {type: string, executionTime: string, arg: any|null};
export type JobHandlerCollection = Record<string, JobHandler>

export default class Cron {
    private jobs: Record<string, schedule.Job>;
    private _handlers: JobHandlerCollection;
    private readonly callbacks: Record<string, JobCallback>;
    handlersModifiedCallback: (() => void)|null;

    constructor() {
        this.jobs = {};
        this._handlers = {};
        this.callbacks = {};
        this.handlersModifiedCallback = null;
    }

    private onHandlersModified() {
        if (this.handlersModifiedCallback) {
            this.handlersModifiedCallback();
        }
    }

    on(jobType: string, cb: JobCallback) {
        this.callbacks[jobType] = cb;
    }

    private doScheduleJob(id: string, executionTime: Date): boolean {
        const job = schedule.scheduleJob(executionTime, async () => {
            await this.invoke(id);
        });

        if (job === null) {
            return false;
        }

        this.jobs[id] = job;

        return true;
    }

    createJob(type: string, executionTime: Date, arg: any|null = null, handlerId: string|null = null): string|null {
        handlerId ??= uniqid(`${type}:`);
        const success = this.doScheduleJob(handlerId, executionTime);

        if (success) {
            this._handlers[handlerId] = {
                type,
                arg,
                executionTime: executionTime.toJSON()
            };
            this.onHandlersModified();
    
            return handlerId;
        }

        return null;
    }

    cancelJob(...ids: string[]) {
        for (const id of ids) {
            this.jobs[id]?.cancel();
            delete this.jobs[id];
            delete this._handlers[id];
        }

        this.onHandlersModified();
    }

    rescheduleJob(id: string, newDate: Date): boolean {
        const success = this.jobs[id].reschedule(newDate);

        if (success) {
            this._handlers[id].executionTime = newDate.toJSON();
            this.onHandlersModified();
        }

        return success;
    }

    setJobArgument(id: string, newArg: any|null) {
        this._handlers[id].arg = newArg;
        this.onHandlersModified();
    }

    async invokeCallback(type: string, arg: any|null = null): Promise<void> {
        await this.callbacks[type](arg);
    }

    async invoke(id: string): Promise<void> {
        const handlerData = this._handlers[id];

        if (!handlerData) {
            throw new Error(`Could not find a job with id "${id}" to invoke.`);
        }

        await this.invokeCallback(handlerData.type, handlerData.arg);

        delete this.jobs[id];
        delete this._handlers[id];
        this.onHandlersModified();
    }

    get handlers(): JobHandlerCollection {
        return structuredClone(this._handlers);
    }
}