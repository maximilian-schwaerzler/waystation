import {test, describe, after} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile, stat, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";

const dataDir = await mkdtemp(path.join(tmpdir(), "waystation-gc-test-"));
process.env.WAYSTATION_DATA_DIR = dataDir;
await mkdir(path.join(dataDir, "files"), {recursive: true});

const {getDb} = await import("../../src/lib/db.js");
const {runGc} = await import("../../src/lib/gc.js");
const {deleteFile} = await import("../../src/lib/fileRemoval.js");

const db = getDb();

function insertFile({token, storagePath, expiresAt}) {
    db.prepare(`
        INSERT INTO files (token, original_name, storage_path, size_bytes, expires_at)
        VALUES (@token, @originalName, @storagePath, @sizeBytes, @expiresAt)
    `).run({token, originalName: "test.txt", storagePath, sizeBytes: 0, expiresAt});
    return db.prepare("SELECT id FROM files WHERE token = ?").get(token).id;
}

function rowExists(token) {
    return db.prepare("SELECT 1 FROM files WHERE token = ?").get(token) !== undefined;
}

const past = () => new Date(Date.now() - 1000).toISOString();
const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const randomStoragePath = (suffix = "") => `files/${randomUUID()}${suffix}`;

after(async () => {
    db.close();

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
});

describe("runGc", () => {
    test("does not touch a non-expired row", async () => {
        const token = randomUUID();
        insertFile({token, storagePath: randomStoragePath(), expiresAt: future()});

        await runGc();

        assert.equal(rowExists(token), true);
    });

    test("removes an expired row and its file from disk", async () => {
        const token = randomUUID();
        const storagePath = randomStoragePath();
        await writeFile(path.join(dataDir, storagePath), "expired content");
        insertFile({token, storagePath, expiresAt: past()});

        await runGc();

        assert.equal(rowExists(token), false);
        await assert.rejects(() => stat(path.join(dataDir, storagePath)));
    });

    test("removes the row even if the file is already missing (ENOENT-tolerant)", async () => {
        const token = randomUUID();
        insertFile({token, storagePath: randomStoragePath("-missing"), expiresAt: past()});

        await assert.doesNotReject(() => runGc());

        assert.equal(rowExists(token), false);
    });

    test("retains the row when deletion fails with a non-ENOENT error", async () => {
        const token = randomUUID();
        const dirAsStoragePath = randomStoragePath("-dir");
        await mkdir(path.join(dataDir, dirAsStoragePath), {recursive: true});
        insertFile({token, storagePath: dirAsStoragePath, expiresAt: past()});

        await assert.doesNotReject(() => runGc());

        assert.equal(rowExists(token), true);
    });

    test("processes a mixed batch independently", async () => {
        const keep = randomUUID();
        const deleted = randomUUID();
        const missing = randomUUID();
        const failing = randomUUID();

        insertFile({token: keep, storagePath: randomStoragePath(), expiresAt: future()});

        const deletedPath = randomStoragePath();
        await writeFile(path.join(dataDir, deletedPath), "content");
        insertFile({token: deleted, storagePath: deletedPath, expiresAt: past()});

        insertFile({token: missing, storagePath: randomStoragePath("-missing"), expiresAt: past()});

        const failingPath = randomStoragePath("-dir");
        await mkdir(path.join(dataDir, failingPath), {recursive: true});
        insertFile({token: failing, storagePath: failingPath, expiresAt: past()});

        await assert.doesNotReject(() => runGc());

        assert.equal(rowExists(keep), true);
        assert.equal(rowExists(deleted), false);
        assert.equal(rowExists(missing), false);
        assert.equal(rowExists(failing), true);
    });
});

describe("deleteFile", () => {
    test("deletes an existing file and its row", async () => {
        const token = randomUUID();
        const storagePath = randomStoragePath();
        await writeFile(path.join(dataDir, storagePath), "content");
        const id = insertFile({token, storagePath, expiresAt: future()});

        await deleteFile(id, storagePath);

        assert.equal(rowExists(token), false);
    });

    test("tolerates a missing file and still removes the row", async () => {
        const token = randomUUID();
        const storagePath = randomStoragePath("-missing");
        const id = insertFile({token, storagePath, expiresAt: future()});

        await deleteFile(id, storagePath);

        assert.equal(rowExists(token), false);
    });

    test("rethrows on a non-ENOENT error and leaves the row intact", async () => {
        const token = randomUUID();
        const storagePath = randomStoragePath("-dir");
        await mkdir(path.join(dataDir, storagePath), {recursive: true});
        const id = insertFile({token, storagePath, expiresAt: future()});

        await assert.rejects(() => deleteFile(id, storagePath));

        assert.equal(rowExists(token), true);
    });
});
