var EventEmitter = require('events');

class Queue extends EventEmitter {
  constructor() {
    super();
    this._queue = [];
  }

  push(req, resp) {
    var ip = requestIP(req);
    for (let entry of this._queue) {
      if (entry.ip === ip) {
        entry.requests.push([req, resp]);
        return;
      }
    }
    this._queue.push({ip: ip, requests: [[req, resp]]});
    if (this._queue.length === 1) {
      process.nextTick(this._schedulerTick.bind(this));
    }
  }

  doneHandling() {
    var event = this._queue.shift();
    if (event.requests.length > 0) {
      // Let other hosts get a turn before returning to
      // this particular host.
      this._queue.push(event);
    }
    if (this._queue.length > 0) {
      process.nextTick(this._schedulerTick.bind(this));
    }
  }

  _schedulerTick() {
    var event = this._queue[0];
    var result = event.requests.shift();
    this.emit('request', result[0], result[1]);
  }
}

function requestIP(req) {
  var forwardedAddr = req.headers['x-forwarded-for'];
  if (forwardedAddr) {
    return forwardedAddr;
  }
  return req.connection.remoteAddress;
}

module.exports = Queue;
