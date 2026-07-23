// sgfc_worker.js
// 1. Import auto-generated Emscripten WASM runtime
importScripts('./sgfc_wasm_runtime.js');

let sgfcModule;

// 2. Instantiate the module and load "sgfc.wasm" verbatim.
createSGFC().then(instance => {
    sgfcModule = instance;
    self.postMessage({ type: 'ready' });
}).catch(err => {
    self.postMessage({ type: 'error', error: "Failed to load SGFC WASM runtime: " + (err.message || err) });
});

self.onmessage = function(e) {
    if (!sgfcModule) {
        self.postMessage({ error: "SGFC engine is still mounting sgfc.wasm." });
        return;
    }

    const rawSgf = typeof e.data === 'string' ? e.data : (e.data && e.data.sgf);
    if (!rawSgf) {
        self.postMessage({ error: "No SGF kifu content provided." });
        return;
    }

    const inputPath = 'audit_in.sgf';
    const outputPath = 'audit_out.sgf';

    // 3. Virtual I/O Bridging: Write the raw string to the virtual file system
    try { sgfcModule.FS.unlink(outputPath); } catch(err) {}
    sgfcModule.FS.writeFile(inputPath, rawSgf);

    let exitCode;
    try {
        // 4. Execution & Argument Passing: Run SGFC with the preserve (-p) flag
        exitCode = sgfcModule.callMain(['-p', inputPath, outputPath]);
    } catch (err) {
        if (err.name === 'ExitStatus') {
            exitCode = err.status;
        } else {
            self.postMessage({ error: "Fatal WebAssembly execution failure." });
            return;
        }
    }

    let complianceStatus = "100% Compliant";
    if (exitCode === 1) complianceStatus = "Repaired (Warnings found)";
    if (exitCode === 2) complianceStatus = "Repaired (Errors found)";
    if (exitCode === 20) complianceStatus = "Fatal: Unrecoverable Tree";

    let repairedSgf = null;
    
    // SGFC Exit Code 20 means the SGF tree is mathematically unrecoverable.
    if (exitCode !== 20) {
        try {
            // Read the 100% FF[4] compliant file back from the virtual file system
            repairedSgf = sgfcModule.FS.readFile(outputPath, { encoding: 'utf8' });
        } catch (err) {
            repairedSgf = null;
        }
    }

    // 5. Memory Management: Prevent browser crash by freeing virtual disk space
    try { sgfcModule.FS.unlink(inputPath); } catch(e) {}
    try { sgfcModule.FS.unlink(outputPath); } catch(e) {}

    self.postMessage({ 
        exitCode: exitCode,
        status: complianceStatus,
        isPristine: exitCode === 0,
        sgf: repairedSgf 
    });
};
