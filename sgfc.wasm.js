/**
 * SGFC WebAssembly Core Module Wrapper
 * 
 * Wraps C-based SGFC (Smart Game Format Checker) compiled to WebAssembly via Emscripten.
 * Serves as the core auditing engine for raw SGF kifu inspection & repair.
 */
const createSGFC = require('./sgfc.js');

let moduleInstance = null;
let initPromise = null;

function ensureInit() {
    if (!initPromise) {
        initPromise = createSGFC().then(instance => {
            moduleInstance = instance;
            return instance;
        });
    }
    return initPromise;
}

// Trigger WASM module compilation / instantiation
ensureInit();

const Module = {
    get FS() {
        if (!moduleInstance) {
            throw new Error("SGFC WASM Module not yet initialized. Please await Module.ready or auditor.init()");
        }
        return moduleInstance.FS;
    },
    callMain(args) {
        if (!moduleInstance) {
            throw new Error("SGFC WASM Module not yet initialized. Please await Module.ready or auditor.init()");
        }
        return moduleInstance.callMain(args);
    },
    get isReady() {
        return !!moduleInstance;
    },
    get ready() {
        return ensureInit();
    },
    init: ensureInit,
    get rawInstance() {
        return moduleInstance;
    }
};

module.exports = Module;
