import {timingSafeEqual} from "crypto";
import {uploadAuthToken} from "./config.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Checks the Authorization header on an upload request against
 * WAYSTATION_UPLOAD_TOKEN. If no token is configured, uploads are
 * unauthenticated and this always returns true.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
export function isAuthorizedUpload(req) {
    if (!uploadAuthToken) return true;

    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) return false;

    const provided = Buffer.from(header.slice(BEARER_PREFIX.length));
    const expected = Buffer.from(uploadAuthToken);

    // timingSafeEqual throws on mismatched lengths rather than returning
    // false, and its comparison isn't constant-time unless lengths already
    // match — so the length check has to happen first regardless.
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(provided, expected);
}