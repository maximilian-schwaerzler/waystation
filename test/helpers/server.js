import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import net from "node:net";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT = path.resolve(__dirname, "../../src/index.js");
const READY_TIMEOUT_MS = 10_000;

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, "127.0.0.1", () => {
            const {port} = srv.address();
            srv.close((err) => err ? reject(err) : resolve(port));
        });
        srv.on("error", reject);
    });
}

/**
 * Spawns a real Waystation server (node src/index.js) against a fresh temp
 * data dir, pre-seeded with a sentinel file so it starts directly in the
 * "ready" steady state instead of the first-run/awaiting-env exit(0) paths.
 * @param {{env?: Record<string, string>}} [options]
 * @returns {Promise<{baseUrl: string, dataDir: string, port: number, stop: () => Promise<void>}>}
 */
export async function startServer(options = {}) {
    const dataDir = await mkdtemp(path.join(tmpdir(), "waystation-test-"));
    const instanceId = randomUUID();
    await writeFile(path.join(dataDir, ".waystation_instance_id"), instanceId);

    const port = await getFreePort();

    const env = {
        ...process.env,
        WAYSTATION_DATA_DIR: dataDir,
        WAYSTATION_INSTANCE_ID: instanceId,
        WAYSTATION_PORT: String(port),
        ...options.env,
    };
    // Env vars not explicitly set by the caller must not leak in from the
    // parent process (e.g. a developer's local .env), since tests assert
    // behavior for both the configured and unconfigured states.
    if (!options.env || !("WAYSTATION_UPLOAD_TOKEN" in options.env)) {
        delete env.WAYSTATION_UPLOAD_TOKEN;
    }
    if (!options.env || !("WAYSTATION_PUBLIC_URL" in options.env)) {
        delete env.WAYSTATION_PUBLIC_URL;
    }

    const child = spawn(process.execPath, [ENTRYPOINT], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanupListeners();
            reject(new Error(
                `Server did not become ready within ${READY_TIMEOUT_MS}ms.\n` +
                `stdout:\n${stdout}\nstderr:\n${stderr}`
            ));
        }, READY_TIMEOUT_MS);

        function onStdout() {
            if (stdout.includes("Server running on")) {
                cleanupListeners();
                resolve();
            }
        }

        function onExit(code) {
            cleanupListeners();
            reject(new Error(
                `Server process exited early (code ${code}).\nstdout:\n${stdout}\nstderr:\n${stderr}`
            ));
        }

        function cleanupListeners() {
            clearTimeout(timeout);
            child.stdout.off("data", onStdout);
            child.off("exit", onExit);
        }

        child.stdout.on("data", onStdout);
        child.on("exit", onExit);
        child.on("error", reject);
    });

    const baseUrl = `http://localhost:${port}`;

    async function stop() {
        child.kill();
        await new Promise((resolve) => child.once("exit", resolve));

        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                await rm(dataDir, {recursive: true, force: true});
                return;
            } catch (err) {
                if (attempt === 5) {
                    console.warn(`[test cleanup] failed to remove ${dataDir}: ${err.message}`);
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
            }
        }
    }

    return {baseUrl, dataDir, port, stop};
}
