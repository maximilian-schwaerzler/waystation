import {test, describe, after} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT = path.resolve(__dirname, "../../src/index.js");

const tempDirs = [];

after(async () => {
    for (const dir of tempDirs) {
        await rm(dir, {recursive: true, force: true}).catch(() => {});
    }
});

/**
 * Spawns the server entrypoint and resolves once it exits, without waiting
 * for it to reach a listening state — used for the two readiness-flow states
 * that print instructions and process.exit(0) before ever calling listen().
 */
function runOnce(overrides) {
    const env = {...process.env, ...overrides};
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete env[key];
    }

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [ENTRYPOINT], {
            env,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        child.on("error", reject);
        child.on("exit", (code) => resolve({code, stdout, stderr}));

        setTimeout(() => reject(new Error(`Process did not exit in time.\nstdout:\n${stdout}\nstderr:\n${stderr}`)), 5000);
    });
}

describe("instance-ID / storage-readiness flow", () => {
    test("first run: no sentinel, no env var - generates and persists an ID, exits 0", async () => {
        const dataDir = await mkdtemp(path.join(tmpdir(), "waystation-datastorage-test-"));
        tempDirs.push(dataDir);

        const {code, stdout} = await runOnce({WAYSTATION_DATA_DIR: dataDir, WAYSTATION_INSTANCE_ID: undefined});

        assert.equal(code, 0);
        assert.match(stdout, /First run detected/);
        assert.match(stdout, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    });

    test("awaiting env: sentinel present, no env var - reports the existing ID, exits 0", async () => {
        const dataDir = await mkdtemp(path.join(tmpdir(), "waystation-datastorage-test-"));
        tempDirs.push(dataDir);
        const existingId = randomUUID();
        await writeFile(path.join(dataDir, ".waystation_instance_id"), existingId);

        const {code, stdout} = await runOnce({WAYSTATION_DATA_DIR: dataDir, WAYSTATION_INSTANCE_ID: undefined});

        assert.equal(code, 0);
        assert.match(stdout, /Storage already initialized/);
        assert.ok(stdout.includes(existingId));
    });

    test("mismatch: sentinel present, env var set to a different ID - fails without starting", async () => {
        const dataDir = await mkdtemp(path.join(tmpdir(), "waystation-datastorage-test-"));
        tempDirs.push(dataDir);
        const sentinelId = randomUUID();
        await writeFile(path.join(dataDir, ".waystation_instance_id"), sentinelId);

        const {code, stdout, stderr} = await runOnce({WAYSTATION_DATA_DIR: dataDir, WAYSTATION_INSTANCE_ID: randomUUID()});

        assert.notEqual(code, 0);
        assert.match(stdout + stderr, /does not match/);
    });
});
