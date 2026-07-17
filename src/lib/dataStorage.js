import {dataDir} from "./config.js";
import {readFile, writeFile} from "fs/promises";
import path from "path";
import {INSTANCE_ID_FILENAME} from "./constants.js";
import {v4 as uuidv4, validate as uuidValidate} from "uuid";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Implements the instance-ID / storage-readiness flow (see CLAUDE.md).
 *
 * Resolves with a status for the caller to act on. The two "not configured
 * yet" cases (first run / env var not set) are expected outcomes the
 * operator needs to act on, not errors — the caller should print
 * instructions and exit(0). Throws for unrecoverable failures (timeout,
 * mismatch, unreadable sentinel) so the caller can log and exit(1).
 *
 * @returns {Promise<
 *   {status: 'ready'} |
 *   {status: 'first_run', id: string} |
 *   {status: 'awaiting_env', id: string}
 * >}
 * @throws {Error} On an unrecoverable failure: sentinel file present but
 *   unreadable/invalid, WAYSTATION_INSTANCE_ID mismatched against storage,
 *   or the readiness poll timed out. Callers must catch this, log it, and
 *   exit(1) — none of these are retryable by calling waitForDataDir again.
 */
export async function waitForDataDir() {
    const envId = process.env.WAYSTATION_INSTANCE_ID;
    const envSet = envId !== undefined && envId !== "";

    if (!envSet) {
        const result = await sentinelFileHealthcheck();

        if (result.status === 'not_found') {
            // State 1: true first run — generate and persist a new instance ID
            const id = uuidv4();
            try {
                await writeFile(path.resolve(dataDir, INSTANCE_ID_FILENAME), id);
            } catch (err) {
                throw new Error(
                    `Cannot write sentinel file to ${dataDir}: ${err.message}. Check that ` +
                    `WAYSTATION_DATA_DIR is mounted and writable.`,
                    {cause: err}
                );
            }
            return {status: 'first_run', id};
        }

        if (result.status === 'ok') {
            // State 2: storage already initialized, env var just hasn't been set yet
            return {status: 'awaiting_env', id: result.id};
        }

        throw new Error(
            `Cannot read sentinel file: ${result.status === 'invalid' ? 'not a valid UUID' : result.error.message}`
        );
    }

    // Env var is set — poll in case the storage mount isn't attached yet
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        const result = await sentinelFileHealthcheck();

        if (result.status === 'ok') {
            // State 4: normal steady state
            if (result.id !== envId) {
                throw new Error(
                    `WAYSTATION_INSTANCE_ID (${envId}) does not match the instance ID found in storage ` +
                    `(${result.id}). Wrong volume mounted?`
                );
            }
            return {status: 'ready'};
        }

        if (result.status === 'invalid' || result.status === 'error') {
            throw new Error(
                `Sentinel file exists but could not be read: ` +
                `${result.status === 'invalid' ? 'not a valid UUID' : result.error.message}`
            );
        }

        // not_found — keep polling, the mount may still be attaching
        if (attempt < POLL_MAX_ATTEMPTS) {
            await sleep(POLL_INTERVAL_MS);
        }
    }

    // State 3 timeout: ambiguous between "mount never attached" and "user
    // pre-set their own ID on a real first run" — the message covers both.
    throw new Error(
        `Sentinel file not found after ${POLL_MAX_ATTEMPTS} attempts ` +
        `(${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s). Either the storage mount isn't ready, or ` +
        `WAYSTATION_INSTANCE_ID was set before the first run ever completed. Check that WAYSTATION_DATA_DIR ` +
        `is mounted correctly.`
    );
}

/**
 * Runs the instance-ID / storage-readiness flow and acts on the result:
 * prints operator instructions and exit(0)s for the "not configured yet"
 * cases, logs and exit(-1)s on an unrecoverable failure, or resolves
 * normally once storage is verified ready.
 */
export async function ensureDataDirReady() {
    try {
        const dataDirStatus = await waitForDataDir();

        if (dataDirStatus.status === "first_run") {
            console.log(`First run detected. Generated instance ID: ${dataDirStatus.id}`);
            console.log(`Set WAYSTATION_INSTANCE_ID=${dataDirStatus.id} in your .env file, then restart.`);
            process.exit(0);
        }

        if (dataDirStatus.status === "awaiting_env") {
            console.log(`Storage already initialized with instance ID: ${dataDirStatus.id}`);
            console.log(`Set WAYSTATION_INSTANCE_ID=${dataDirStatus.id} in your .env file, then restart.`);
            process.exit(0);
        }

        if (dataDirStatus.status === "ready") {
            console.log("Storage verified.");
            // continue normal execution
        }
    } catch (err) {
        console.error(`Storage readiness check failed: ${err.message}`);
        process.exit(-1);
    }
}

/**
 * Checks if the sentinel file exists and is accessible.
 * @returns {Promise<
 *   {status: 'ok', id: string} |
 *   {status: 'not_found'} |
 *   {status: 'invalid'} |
 *   {status: 'error', error: Error}
 * >}
 */
async function sentinelFileHealthcheck() {
    try {
        const contents = await readFile(path.resolve(dataDir, INSTANCE_ID_FILENAME));
        const id = contents.toString().trim();
        if (uuidValidate(id)) {
            return {status: 'ok', id};
        }
        console.warn("Sentinel file not valid UUID");
        return {status: 'invalid'};
    } catch (err) {
        if (err.code === 'ENOENT') {
            return {status: 'not_found'};
        }
        console.warn(`Sentinel file healthcheck failed: ${err.message}`);
        return {status: 'error', error: err};
    }
}