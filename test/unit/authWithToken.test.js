import {test, describe} from "node:test";
import assert from "node:assert/strict";

process.env.WAYSTATION_UPLOAD_TOKEN = "secret123";
const {isAuthorizedUpload} = await import("../../src/lib/auth.js");

describe("isAuthorizedUpload (upload token configured)", () => {
    test("no Authorization header is unauthorized", () => {
        assert.equal(isAuthorizedUpload({headers: {}}), false);
    });

    test("non-Bearer scheme is unauthorized", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Basic secret123"}}), false);
    });

    test("wrong bearer value is unauthorized", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Bearer wrongvalue"}}), false);
    });

    test("bearer value shorter than expected is unauthorized", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Bearer short"}}), false);
    });

    test("bearer value longer than expected is unauthorized", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Bearer secret123extra"}}), false);
    });

    test("empty bearer value is unauthorized", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Bearer "}}), false);
    });

    test("correct bearer value is authorized", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Bearer secret123"}}), true);
    });
});
