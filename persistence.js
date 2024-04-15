const fs = require("fs");

/**
 * @typedef {Object} PersistenceData
 * @property {?string} lastSeenPostPublicationDate
 * @property {?NotificatorState} notificatorState
 * @property {Object<string, InteractionHandlerData>} interactionHandlers
 * @property {Object<string, number>} characterPoints
 */

class Persistence {
    /** @type {string} */
    #fileName;

    /** @type {PersistenceData} */
    #data;

    /**
     * @param fileName {string}
     */
    constructor(fileName) {
        this.#fileName = "FLY_APP_NAME" in process.env ? `/persistence/${fileName}` : fileName;
        this.#data = {
            lastSeenPostPublicationDate: null,
            notificatorState: null,
            interactionHandlers: {},
            characterPoints: {}
        };

        if (fs.existsSync(this.#fileName)) {
            const content = fs.readFileSync(this.#fileName, "utf8");
            this.#data = {...this.#data, ...JSON.parse(content)};
        }
    }

    /**
     * @returns {PersistenceData}
     */
    get data() {
        return this.#data;
    }

    saveState() {
        fs.writeFileSync(this.#fileName, JSON.stringify(this.#data, undefined, 2), "utf8");
    }
}

module.exports = Persistence;
