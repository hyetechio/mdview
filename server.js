const http = require('node:http');
const { dispatch } = require('./lib/handlers');

function createServer(options = {}) {
  const root = options.root || process.env.HOME;
  if (!root) throw new Error('no root configured (set HOME or pass {root})');
  return http.createServer((req, res) => {
    dispatch(req, res, { root }).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(`server error: ${err.message}`);
      }
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.MDVIEW_PORT || 5237);
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`mdview daemon listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createServer };
