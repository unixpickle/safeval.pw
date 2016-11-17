var http = require('http');
var url = require('url');
var vm = require('vm');

var SCRIPT_TIMEOUT = 1000;
var MAX_LENGTH = 1000;

if (process.argv.length !== 3) {
  console.log('Usage: node main.js <port>');
  process.exit(1);
}

function evaluate(req, resp) {
  var parsed = url.parse(req.url, true).query;
  if ('string' !== typeof parsed.code) {
    resp.statusCode = 400;
    resp.end('expected exactly one (string) code parameter');
    return;
  }
  var options = {timeout: SCRIPT_TIMEOUT};
  var script = new vm.Script(parsed.code, options);
  var result = '' + script.runInNewContext({}, options);
  if (result.length > MAX_LENGTH) {
    resp.statusCode = 500;
    resp.end('result is too long');
  } else {
    resp.end(result);
  }
}

function sendHomepage(resp) {
  var page = '<!doctype html><html>' +
    '<body><form action="eval"><input name="code"><input type="submit"></form></body>' +
    '</html>';
  resp.setHeader('content-type', 'text/html');
  resp.end(page);
}

function handleRequest(req, resp) {
  // TODO: rate limit by IP.

  if (/^\/eval\?code=/.exec(req.url)) {
    if (req.url.length > MAX_LENGTH) {
      resp.statusCode = 400;
      resp.end('code is too long');
      return;
    }
    try {
      evaluate(req, resp);
    } catch (e) {
      resp.statusCode = 400;
      resp.end('failed to evaluate');
    }
    return;
  } else if (req.url === '/' || req.url === '') {
    sendHomepage(resp);
    return;
  }

  resp.statusCode = 404;
  resp.end('Not found.');
}

function runServer() {
  var server = http.createServer(handleRequest);
  server.listen(parseInt(process.argv[2]), function(err) {
    if (err) {
      console.log('Error listening:', err);
      process.exit(1);
    } else {
      console.log('Listening on port', process.argv[2]);
    }
  });
}

runServer();
