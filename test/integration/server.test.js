import {test, describe, before, after} from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";
import {startServer} from "../helpers/server.js";

describe("server (no upload token configured)", () => {
    let server;

    before(async () => {
        server = await startServer({env: {WAYSTATION_MAX_UPLOAD_SIZE_MB: "1"}});
    });

    after(async () => {
        await server.stop();
    });

    test("GET / returns a health check", async () => {
        const res = await fetch(`${server.baseUrl}/`);
        assert.equal(res.status, 200);
        assert.equal(await res.text(), "healthy");
    });

    test("unknown route returns 404", async () => {
        const res = await fetch(`${server.baseUrl}/nonexistent-route`);
        assert.equal(res.status, 404);
    });

    test("upload without filename returns 400", async () => {
        const res = await fetch(`${server.baseUrl}/upload`, {method: "POST", body: "data"});
        assert.equal(res.status, 400);
    });

    test("upload sanitizes a path-traversal filename to its basename", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=${encodeURIComponent("../../etc/passwd")}`, {
            method: "POST",
            body: "malicious traversal attempt",
        });
        assert.equal(res.status, 201);
        const body = await res.json();

        const db = new Database(path.join(server.dataDir, "waystation.db"), {readonly: true});
        try {
            const row = db.prepare("SELECT original_name FROM files WHERE token = ?").get(body.token);
            assert.equal(row.original_name, "passwd");
        } finally {
            db.close();
        }
    });

    test("upload with filename '..' returns 400", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=${encodeURIComponent("..")}`, {
            method: "POST",
            body: "data",
        });
        assert.equal(res.status, 400);
    });

    test("upload succeeds and returns token/downloadUrl/expiresAt", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=report.pdf`, {
            method: "POST",
            body: "some file contents",
        });
        assert.equal(res.status, 201);

        const body = await res.json();
        assert.equal(typeof body.token, "string");
        assert.ok(body.token.length > 0);
        assert.equal(body.downloadUrl, `${server.baseUrl}/download/${body.token}`);
        assert.ok(!Number.isNaN(new Date(body.expiresAt).getTime()));

        assert.equal(res.headers.get("location"), body.downloadUrl);
    });

    test("upload is unauthenticated when no upload token is configured", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=noauth.txt`, {
            method: "POST",
            body: "data",
        });
        assert.equal(res.status, 201);
    });

    test("download of an unknown token returns 404", async () => {
        const res = await fetch(`${server.baseUrl}/download/does-not-exist`);
        assert.equal(res.status, 404);
    });

    test("uploaded file can be downloaded with matching content and headers", async () => {
        const content = "the quick brown fox jumps over the lazy dog";
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=fox.txt`, {
            method: "POST",
            body: content,
        });
        const {token} = await uploadRes.json();

        const downloadRes = await fetch(`${server.baseUrl}/download/${token}`);
        assert.equal(downloadRes.status, 200);
        assert.equal(await downloadRes.text(), content);
        assert.equal(downloadRes.headers.get("content-length"), String(content.length));
        assert.match(downloadRes.headers.get("content-disposition"), /filename="fox\.txt"/);
        assert.equal(downloadRes.headers.get("accept-ranges"), "bytes");
        assert.equal(downloadRes.headers.get("content-type"), "application/octet-stream");
        assert.equal(downloadRes.headers.get("x-content-type-options"), "nosniff");
    });

    test("upload larger than the configured max size returns 413", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=too-big.bin`, {
            method: "POST",
            body: "x".repeat(2 * 1024 * 1024), // 2MB, exceeds the 1MB test cap
        });
        assert.equal(res.status, 413);
    });

    test("expired file returns 410", async () => {
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=expired.txt`, {
            method: "POST",
            body: "will expire",
        });
        const {token} = await uploadRes.json();

        const db = new Database(path.join(server.dataDir, "waystation.db"));
        try {
            const past = new Date(Date.now() - 1000).toISOString();
            db.prepare("UPDATE files SET expires_at = ? WHERE token = ?").run(past, token);
        } finally {
            db.close();
        }

        const downloadRes = await fetch(`${server.baseUrl}/download/${token}`);
        assert.equal(downloadRes.status, 410);
    });

    describe("range requests", () => {
        let token;
        const content = "0123456789".repeat(100); // 1000 bytes

        before(async () => {
            const uploadRes = await fetch(`${server.baseUrl}/upload?filename=ranges.bin`, {
                method: "POST",
                body: content,
            });
            ({token} = await uploadRes.json());
        });

        test("partial range returns 206 with the requested bytes", async () => {
            const res = await fetch(`${server.baseUrl}/download/${token}`, {
                headers: {Range: "bytes=0-99"},
            });
            assert.equal(res.status, 206);
            assert.equal(res.headers.get("content-range"), "bytes 0-99/1000");
            assert.equal(res.headers.get("content-length"), "100");
            assert.equal(await res.text(), content.slice(0, 100));
        });

        test("suffix range returns the last N bytes", async () => {
            const res = await fetch(`${server.baseUrl}/download/${token}`, {
                headers: {Range: "bytes=-100"},
            });
            assert.equal(res.status, 206);
            assert.equal(res.headers.get("content-range"), "bytes 900-999/1000");
            assert.equal(await res.text(), content.slice(900));
        });

        test("open-ended range returns to end of file", async () => {
            const res = await fetch(`${server.baseUrl}/download/${token}`, {
                headers: {Range: "bytes=900-"},
            });
            assert.equal(res.status, 206);
            assert.equal(res.headers.get("content-range"), "bytes 900-999/1000");
            assert.equal(await res.text(), content.slice(900));
        });

        test("out-of-bounds range returns 416", async () => {
            const res = await fetch(`${server.baseUrl}/download/${token}`, {
                headers: {Range: "bytes=2000-3000"},
            });
            assert.equal(res.status, 416);
            assert.equal(res.headers.get("content-range"), "bytes */1000");
        });

        test("malformed range returns 416", async () => {
            const res = await fetch(`${server.baseUrl}/download/${token}`, {
                headers: {Range: "bytes=abc"},
            });
            assert.equal(res.status, 416);
        });
    });

    test("delete lifecycle: upload, download, delete, then 404 on further access", async () => {
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=delete-me.txt`, {
            method: "POST",
            body: "ephemeral",
        });
        const {token} = await uploadRes.json();

        const beforeDelete = await fetch(`${server.baseUrl}/download/${token}`);
        assert.equal(beforeDelete.status, 200);

        const deleteRes = await fetch(`${server.baseUrl}/upload/${token}`, {method: "DELETE"});
        assert.equal(deleteRes.status, 204);

        const afterDelete = await fetch(`${server.baseUrl}/download/${token}`);
        assert.equal(afterDelete.status, 404);

        const repeatDelete = await fetch(`${server.baseUrl}/upload/${token}`, {method: "DELETE"});
        assert.equal(repeatDelete.status, 404);
    });

    test("delete of an unknown token returns 404", async () => {
        const res = await fetch(`${server.baseUrl}/upload/does-not-exist`, {method: "DELETE"});
        assert.equal(res.status, 404);
    });

    test("delete is unauthenticated when no upload token is configured", async () => {
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=noauth-delete.txt`, {
            method: "POST",
            body: "data",
        });
        const {token} = await uploadRes.json();

        const res = await fetch(`${server.baseUrl}/upload/${token}`, {method: "DELETE"});
        assert.equal(res.status, 204);
    });
});
