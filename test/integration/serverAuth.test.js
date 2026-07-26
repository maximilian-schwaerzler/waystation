import {test, describe, before, after} from "node:test";
import assert from "node:assert/strict";
import {startServer} from "../helpers/server.js";

const UPLOAD_TOKEN = "test-secret-token";

describe("server (upload token configured)", () => {
    let server;

    before(async () => {
        server = await startServer({env: {WAYSTATION_UPLOAD_TOKEN: UPLOAD_TOKEN}});
    });

    after(async () => {
        await server.stop();
    });

    test("upload without an Authorization header returns 401", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=x.txt`, {
            method: "POST",
            body: "data",
        });
        assert.equal(res.status, 401);
        assert.equal(res.headers.get("www-authenticate"), "Bearer");
    });

    test("upload with the wrong bearer token returns 401", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=x.txt`, {
            method: "POST",
            body: "data",
            headers: {Authorization: "Bearer wrong-token"},
        });
        assert.equal(res.status, 401);
    });

    test("upload with a malformed Authorization header returns 401", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=x.txt`, {
            method: "POST",
            body: "data",
            headers: {Authorization: `Basic ${UPLOAD_TOKEN}`},
        });
        assert.equal(res.status, 401);
    });

    test("upload with the correct bearer token succeeds", async () => {
        const res = await fetch(`${server.baseUrl}/upload?filename=x.txt`, {
            method: "POST",
            body: "data",
            headers: {Authorization: `Bearer ${UPLOAD_TOKEN}`},
        });
        assert.equal(res.status, 201);
    });

    test("delete without an Authorization header returns 401", async () => {
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=to-delete.txt`, {
            method: "POST",
            body: "data",
            headers: {Authorization: `Bearer ${UPLOAD_TOKEN}`},
        });
        const {token} = await uploadRes.json();

        const res = await fetch(`${server.baseUrl}/upload/${token}`, {method: "DELETE"});
        assert.equal(res.status, 401);
    });

    test("delete with the correct bearer token succeeds", async () => {
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=to-delete-2.txt`, {
            method: "POST",
            body: "data",
            headers: {Authorization: `Bearer ${UPLOAD_TOKEN}`},
        });
        const {token} = await uploadRes.json();

        const res = await fetch(`${server.baseUrl}/upload/${token}`, {
            method: "DELETE",
            headers: {Authorization: `Bearer ${UPLOAD_TOKEN}`},
        });
        assert.equal(res.status, 204);
    });

    test("download remains unauthenticated even when an upload token is configured", async () => {
        const uploadRes = await fetch(`${server.baseUrl}/upload?filename=public.txt`, {
            method: "POST",
            body: "no auth needed to download",
            headers: {Authorization: `Bearer ${UPLOAD_TOKEN}`},
        });
        const {token} = await uploadRes.json();

        const res = await fetch(`${server.baseUrl}/download/${token}`);
        assert.equal(res.status, 200);
    });
});
