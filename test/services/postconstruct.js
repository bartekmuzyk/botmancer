function asyncWait(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

class PostConstructService {
    constructor() {
        console.log(`Hello from PostConstruct! constructor()`);
    }

    async postConstruct() {
        console.log(`Hello from PostConstruct! postConstruct() - before asyncWait()`);
        await asyncWait(2);
        console.log(`Hello from PostConstruct! postConstruct() - after asyncWait()`);
    }
}

module.exports = PostConstructService;
