function padZero(num) {
    let r = num.toString();
    return r.length === 1 ? `0${r}` : r;
}

const months = [
    'styczeń',      'luty',     'marzec',
    'kwiecień',     'maj',      'czerwiec',
    'lipiec',       'sierpień', 'wrzesień',
    'październik',  'listopad', 'grudzień'
];

/**
 * @param date {Date}
 * @returns {string}
 */
const toBasicISOString = date => `${date.getUTCFullYear()}-${padZero(date.getUTCMonth() + 1)}-${padZero(date.getUTCDate())}T${padZero(date.getUTCHours())}:${padZero(date.getUTCMinutes())}Z`;

/**
 * @param date {Date}
 * @returns {string}
 */
const humanForm = date => `${date.getDate()} ${months[date.getMonth()]} o ${date.getHours()}:${padZero(date.getMinutes())}`;

const now = () => new Date();

const create = arg => new Date(arg);

const addTime = (date, seconds) => create(date.getTime() + (seconds * 1000));

module.exports = {toBasicISOString, now, create, humanForm, addTime};
