import pino from "pino";
import path from "path";
import {Writable} from "stream";
import buildRollStream from "pino-roll";
import {dataDir} from "./config.js";

// Set WAYSTATION_LOG_LEVEL to control verbosity (trace, debug, info, warn,
// error, fatal). Defaults to 'info'. Per-request detail logs at 'debug'.
const LOG_LEVEL = process.env.WAYSTATION_LOG_LEVEL || 'info';

/**
 * Wraps one or more destination streams in a single Writable that pino can
 * log NDJSON into, reformatting each line as `[TIMESTAMP][LEVEL] MESSAGE`
 * before forwarding it on.
 * @param {NodeJS.WritableStream[]} destinations
 */
function createHumanReadableStream(destinations) {
    let buffer = '';
    return new Writable({
        write(chunk, encoding, callback) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line) continue;

                let entry;
                try {
                    entry = JSON.parse(line);
                } catch {
                    continue;
                }

                const timestamp = new Date(entry.time).toISOString();
                const level = (pino.levels.labels[entry.level] || 'info').toUpperCase();
                const formatted = `[${timestamp}][${level}] ${entry.msg}\n`;

                for (const destination of destinations) {
                    destination.write(formatted);
                }
            }

            callback();
        },
    });
}

let logger = pino({level: LOG_LEVEL}, createHumanReadableStream([process.stdout]));

/**
 * Returns the shared logger. Always logs to stdout; logs to
 * /data/waystation.log too once enableFileLogging() has been called.
 * @returns {import('pino').Logger}
 */
export function getLogger() {
    return logger;
}

/**
 * Adds /data/waystation.log (rotated via pino-roll) as a second destination
 * alongside stdout. Must not be called until storage readiness is verified
 * (see ensureDataDirReady()), since it does filesystem I/O against dataDir.
 */
export async function enableFileLogging() {
    const fileStream = await buildRollStream({
        file: path.join(dataDir, 'waystation.log'),
        size: '10m',
        mkdir: true,
    });
    logger = pino({level: LOG_LEVEL}, createHumanReadableStream([process.stdout, fileStream]));
}