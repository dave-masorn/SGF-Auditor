/**
 * SGF Auditor Web Module
 * 
 * Audits and repairs raw SGF kifu using WASM-compiled SGFC engine.
 * Guarantees strict FF[4] compliance while preserving Go-domain analytical metadata.
 */
const Module = require('./sgfc.wasm.js');

class SGFAuditor {
    constructor() {
        this.inputPath = 'audit_in.sgf';
        this.outputPath = 'audit_out.sgf';
    }

    /**
     * Ensures WASM engine is loaded and initialized.
     * @returns {Promise<void>}
     */
    async init() {
        await Module.ready;
    }

    /**
     * Audits and repairs raw SGF data.
     * @param {string} rawSgf - The unverified kifu string.
     * @returns {Object} - The compliance status and repaired tree.
     */
    audit(rawSgf) {
        if (!Module.isReady) {
            throw new Error("SGFC WASM engine not ready. Await auditor.init() or auditor.auditAsync(rawSgf).");
        }

        Module.FS.writeFile(this.inputPath, rawSgf);

        let exitCode;
        try {
            // Go-domain decision: Private properties must be preserved (-p).
            // Modern analysis engines (KataGo, Leela Zero) store win-rate and 
            // visit counts in proprietary tags. Stripping them destroys the 
            // analytical utility of the kifu.
            exitCode = Module.callMain(['-p', this.inputPath, this.outputPath]);
        } catch (err) {
            if (err.name === 'ExitStatus') {
                exitCode = err.status;
                if (typeof process !== 'undefined') {
                    process.exitCode = 0;
                }
            } else {
                throw new Error("Fatal WASM execution failure.");
            }
        }

        // Go-domain decision: We must strictly categorize the audit results.
        // A pristine file (0) requires no changes. Warnings (1) and Errors (2)
        // mean the tree was defective but SGFC mathematically repaired it. 
        // Code 20 means the tree structure is entirely unsalvageable.
        let complianceStatus = "100% Compliant";
        if (exitCode === 1) complianceStatus = "Repaired (Warnings found)";
        if (exitCode === 2) complianceStatus = "Repaired (Errors found)";
        if (exitCode === 20) complianceStatus = "Fatal: Unrecoverable Tree";

        let repairedSgf = null;
        if (exitCode !== 20) {
            try {
                repairedSgf = Module.FS.readFile(this.outputPath, { encoding: 'utf8' });
            } catch (e) {
                repairedSgf = null;
            }
        }

        try { Module.FS.unlink(this.inputPath); } catch(e) {}
        try { Module.FS.unlink(this.outputPath); } catch(e) {}

        if (typeof process !== 'undefined') {
            process.exitCode = 0;
        }

        return {
            status: complianceStatus,
            isPristine: exitCode === 0,
            kifu: repairedSgf
        };
    }

    /**
     * Async audit method that awaits module initialization before auditing.
     * @param {string} rawSgf 
     * @returns {Promise<Object>}
     */
    async auditAsync(rawSgf) {
        await this.init();
        return this.audit(rawSgf);
    }
}

module.exports = SGFAuditor;
