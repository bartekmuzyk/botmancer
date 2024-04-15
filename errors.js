const dates = require("./dates");

function logError(err) {
    console.error(`\n🛑 ${dates.now().toLocaleString()}`);
    console.error(err);
    console.error("");
}

module.exports = {
    logError,
    asyncErrorHandler(func) {
        return () => func().catch(logError);
    }
};
