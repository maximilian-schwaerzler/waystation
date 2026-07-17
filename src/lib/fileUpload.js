/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export function handleFileUpload(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end("Upload file here!");
}