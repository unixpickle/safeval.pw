var http = require('http');
var url = require('url');
var vm = require('vm');
var Queue = require('./queue.js');

var SCRIPT_TIMEOUT = 200;
var MAX_LENGTH = 1000;
var REQUEST_DELAY_PERIOD = 1;

if (process.argv.length !== 3) {
  console.log('Usage: node main.js <port>');
  process.exit(1);
}

var requestQueue = new Queue();
requestQueue.on('request', (req, resp) => {
  handleRequest(req, resp);

  // Allow pending requests to register in the queue.
  setTimeout(() => requestQueue.doneHandling(), REQUEST_DELAY_PERIOD);
});

var server = http.createServer(requestQueue.push.bind(requestQueue));
server.listen(parseInt(process.argv[2]), function(err) {
  if (err) {
    console.log('Error listening:', err);
    process.exit(1);
  } else {
    console.log('Listening on port', process.argv[2]);
  }
});

function handleRequest(req, resp) {
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
  } else if (req.url === '/' || req.url === '') {
    sendHomepage(resp);
  } else {
    resp.statusCode = 404;
    resp.end('Not found.');
  }
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
