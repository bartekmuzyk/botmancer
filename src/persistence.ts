import * as fs from "fs";

export default class Persistence<T> {
    private readonly filePath: string;
    // noinspection TypeScriptFieldCanBeMadeReadonly
    private _data: T;

    constructor(filePath: string, defaultData: T) {
        this.filePath = filePath;
        this._data = defaultData;

        if (fs.existsSync(this.filePath)) {
            const content = fs.readFileSync(this.filePath, "utf8");
            this._data = {...this._data, ...JSON.parse(content)};
        }
    }

    get data(): T {
        return this._data;
    }

    saveState() {
        fs.writeFileSync(this.filePath, JSON.stringify(this._data, undefined, 2), "utf8");
    }
}
