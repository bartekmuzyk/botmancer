const fs = require("fs");

/**
 * @template PersistenceDataType
 */
class Persistence {
    /** @type {string} */
    #filePath;

    /** @type {PersistenceDataType} */
    #data;

    /**
     * @param filePath {string}
     * @param defaultData {PersistenceDataType}
     */
    constructor(filePath, defaultData) {
        this.#filePath = filePath;
        this.#data = defaultData;

        if (fs.existsSync(this.#filePath)) {
            const content = fs.readFileSync(this.#filePath, "utf8");
            this.#data = {...this.#data, ...JSON.parse(content)};
        }
    }

    /**
     * @returns {PersistenceDataType}
     */
    get data() {
        return this.#data;
    }

    saveState() {
        fs.writeFileSync(this.#filePath, JSON.stringify(this.#data, undefined, 2), "utf8");
    }
}

module.exports = Persistence;
