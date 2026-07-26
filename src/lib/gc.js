import cron from "node-cron";
import {getDb} from "./db.js";
import {deleteFile} from "./fileRemoval.js";
import {getLogger} from "./logger.js";

// Cron expression for how often GC sweeps expired files. Defaults to hourly.
const GC_SCHEDULE = process.env.WAYSTATION_GC_SCHEDULE || '0 * * * *';

/**
 * Deletes expired files from disk and their DB rows. A failed file deletion
 * leaves the row intact so it's retried on the next run, rather than losing
 * track of a file that still exists on disk.
 */
export async function runGc() {
    const expired = getDb()
        .prepare(`SELECT id, storage_path FROM files WHERE expires_at <= ?`)
        .all(new Date().toISOString());

    if (expired.length === 0) {
        getLogger().debug('GC: no expired files');
        return;
    }

    getLogger().info(`GC: found ${expired.length} expired file(s)`);

    let deletedCount = 0;
    for (const file of expired) {
        try {
            await deleteFile(file.id, file.storage_path);
        } catch (err) {
            getLogger().error(`GC: failed to delete file for file id ${file.id}: ${err.code}`);
            continue;
        }
        deletedCount++;
    }

    getLogger().info(`GC: removed ${deletedCount}/${expired.length} expired file(s)`);
}

/**
 * Schedules runGc() to run on GC_SCHEDULE. Must not be called until storage
 * readiness is verified (see ensureDataDirReady()), since runGc() does
 * filesystem I/O against dataDir and reads the DB.
 */
export function startGc() {
    cron.schedule(GC_SCHEDULE, () => {
        runGc().catch((err) => getLogger().error(`GC run failed: ${err.message}`));
    }, {noOverlap: true});

    getLogger().info(`GC scheduled: ${GC_SCHEDULE}`);
}