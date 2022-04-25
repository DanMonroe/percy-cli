function _classPrivateMethodInitSpec(obj, privateSet) { _checkPrivateRedeclaration(obj, privateSet); privateSet.add(obj); }

function _classPrivateFieldInitSpec(obj, privateMap, value) { _checkPrivateRedeclaration(obj, privateMap); privateMap.set(obj, value); }

function _checkPrivateRedeclaration(obj, privateCollection) { if (privateCollection.has(obj)) { throw new TypeError("Cannot initialize the same private elements twice on an object"); } }

function _classPrivateFieldGet(receiver, privateMap) { var descriptor = _classExtractFieldDescriptor(receiver, privateMap, "get"); return _classApplyDescriptorGet(receiver, descriptor); }

function _classApplyDescriptorGet(receiver, descriptor) { if (descriptor.get) { return descriptor.get.call(receiver); } return descriptor.value; }

function _classPrivateMethodGet(receiver, privateSet, fn) { if (!privateSet.has(receiver)) { throw new TypeError("attempted to get private field on non-instance"); } return fn; }

function _classPrivateFieldSet(receiver, privateMap, value) { var descriptor = _classExtractFieldDescriptor(receiver, privateMap, "set"); _classApplyDescriptorSet(receiver, descriptor, value); return value; }

function _classExtractFieldDescriptor(receiver, privateMap, action) { if (!privateMap.has(receiver)) { throw new TypeError("attempted to " + action + " private field on non-instance"); } return privateMap.get(receiver); }

function _classApplyDescriptorSet(receiver, descriptor, value) { if (descriptor.set) { descriptor.set.call(receiver, value); } else { if (!descriptor.writable) { throw new TypeError("attempted to set read only private field"); } descriptor.value = value; } }

import fs from 'fs';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import mime from 'mime-types';
import disposition from 'content-disposition';
import { pathToRegexp, match as pathToMatch, compile as makeToPath } from 'path-to-regexp'; // custom incoming message adds a `url` and `body` properties containing the parsed URL and message
// buffer respectively; both available after the 'end' event is emitted

export class IncomingMessage extends http.IncomingMessage {
  constructor(socket) {
    let buffer = [];
    super(socket).on('data', d => buffer.push(d)).on('end', () => {
      var _this$headers$content;

      this.url = new URL(this.url, `http://${this.headers.host}`);
      if (buffer.length) this.body = Buffer.concat(buffer);

      if (this.body && (_this$headers$content = this.headers['content-type']) !== null && _this$headers$content !== void 0 && _this$headers$content.includes('json')) {
        try {
          this.body = JSON.parse(this.body);
        } catch {}
      }
    });
  }

} // custom server response adds additional convenience methods

export class ServerResponse extends http.ServerResponse {
  // responds with a status, headers, and body; the second argument can be an content-type string,
  // or a headers object, with content-length being automatically set when a `body` is provided
  send(status, headers, body) {
    if (typeof headers === 'string') {
      this.setHeader('Content-Type', headers);
      headers = null;
    }

    if (body != null && !this.hasHeader('Content-Length')) {
      this.setHeader('Content-Length', Buffer.byteLength(body));
    }

    return this.writeHead(status, headers).end(body);
  } // responds with a status and content with a plain/text content-type


  text(status, content) {
    if (arguments.length < 2) [status, content] = [200, status];
    return this.send(status, 'text/plain', content.toString());
  } // responds with a status and stringified `data` with a json content-type


  json(status, data) {
    if (arguments.length < 2) [status, data] = [200, status];
    return this.send(status, 'application/json', JSON.stringify(data));
  } // responds with a status and streams a file with appropriate headers


  file(status, filepath) {
    if (arguments.length < 2) [status, filepath] = [200, status];
    filepath = path.resolve(filepath);
    let {
      size
    } = fs.lstatSync(filepath);
    let range = parseByteRange(this.req.headers.range, size); // support simple range requests

    if (this.req.headers.range) {
      let byteRange = range ? `${range.start}-${range.end}` : '*';
      this.setHeader('Content-Range', `bytes ${byteRange}/${size}`);
      if (!range) return this.send(416);
    }

    this.writeHead(range ? 206 : status, {
      'Accept-Ranges': 'bytes',
      'Content-Type': mime.contentType(path.extname(filepath)),
      'Content-Length': range ? range.end - range.start + 1 : size,
      'Content-Disposition': disposition(filepath, {
        type: 'inline'
      })
    });
    fs.createReadStream(filepath, range).pipe(this);
    return this;
  }

} // custom server error with a status and default reason

export class ServerError extends Error {
  static throw(status, reason) {
    throw new this(status, reason);
  }

  constructor(status = 500, reason) {
    super(reason || http.STATUS_CODES[status]);
    this.status = status;
  }

} // custom server class handles routing requests and provides alternate methods and properties

var _sockets = /*#__PURE__*/new WeakMap();

var _defaultPort = /*#__PURE__*/new WeakMap();

var _up = /*#__PURE__*/new WeakMap();

var _handleUpgrade = /*#__PURE__*/new WeakSet();

var _routes = /*#__PURE__*/new WeakMap();

var _route = /*#__PURE__*/new WeakSet();

var _handleRequest = /*#__PURE__*/new WeakSet();

export class Server extends http.Server {
  constructor({
    port
  } = {}) {
    super({
      IncomingMessage,
      ServerResponse
    });

    _classPrivateMethodInitSpec(this, _handleRequest);

    _classPrivateMethodInitSpec(this, _route);

    _classPrivateMethodInitSpec(this, _handleUpgrade);

    _classPrivateFieldInitSpec(this, _sockets, {
      writable: true,
      value: new Set()
    });

    _classPrivateFieldInitSpec(this, _defaultPort, {
      writable: true,
      value: void 0
    });

    _classPrivateFieldInitSpec(this, _up, {
      writable: true,
      value: []
    });

    _classPrivateFieldInitSpec(this, _routes, {
      writable: true,
      value: [{
        priority: -1,
        handle: (req, res, next) => {
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (req.method === 'OPTIONS') {
            let allowHeaders = req.headers['access-control-request-headers'] || '*';
            let allowMethods = [...new Set(_classPrivateFieldGet(this, _routes).flatMap(route => (!route.match || route.match(req.url.pathname)) && route.methods || []))].join(', ');
            res.setHeader('Access-Control-Allow-Headers', allowHeaders);
            res.setHeader('Access-Control-Allow-Methods', allowMethods);
            res.writeHead(204).end();
          } else {
            res.setHeader('Access-Control-Expose-Headers', '*');
            return next();
          }
        }
      }, {
        priority: 3,
        handle: req => ServerError.throw(404)
      }]
    });

    _classPrivateFieldSet(this, _defaultPort, port); // handle requests on end


    this.on('request', (req, res) => {
      req.on('end', () => _classPrivateMethodGet(this, _handleRequest, _handleRequest2).call(this, req, res));
    }); // handle websocket upgrades

    this.on('upgrade', (req, sock, head) => {
      _classPrivateMethodGet(this, _handleUpgrade, _handleUpgrade2).call(this, req, sock, head);
    }); // track open connections to terminate when the server closes

    this.on('connection', socket => {
      let handleClose = () => _classPrivateFieldGet(this, _sockets).delete(socket);

      _classPrivateFieldGet(this, _sockets).add(socket.on('close', handleClose));
    });
  } // return the listening port or any default port


  get port() {
    var _super$address;

    return ((_super$address = super.address()) === null || _super$address === void 0 ? void 0 : _super$address.port) ?? _classPrivateFieldGet(this, _defaultPort);
  } // return a string representation of the server address


  address() {
    let port = this.port;
    let host = 'http://localhost';
    return port ? `${host}:${port}` : host;
  } // return a promise that resolves when the server is listening


  listen(port = _classPrivateFieldGet(this, _defaultPort)) {
    return new Promise((resolve, reject) => {
      let handle = err => off() && err ? reject(err) : resolve(this);

      let off = () => this.off('error', handle).off('listening', handle);

      super.listen(port, handle).once('error', handle);
    });
  } // return a promise that resolves when the server closes


  close() {
    return new Promise(resolve => {
      _classPrivateFieldGet(this, _sockets).forEach(socket => socket.destroy());

      super.close(resolve);
    });
  } // handle websocket upgrades


  websocket(pathname, handle) {
    if (!handle) [pathname, handle] = [null, pathname];

    _classPrivateFieldGet(this, _up).push({
      match: pathname && pathToMatch(pathname),
      handle: (req, sock, head) => new Promise(resolve => {
        let wss = new WebSocketServer({
          noServer: true,
          clientTracking: false
        });
        wss.handleUpgrade(req, sock, head, resolve);
      }).then(ws => handle(ws, req))
    });

    if (pathname) {
      _classPrivateFieldGet(this, _up).sort((a, b) => (a.match ? -1 : 1) - (b.match ? -1 : 1));
    }

    return this;
  }

  // set request routing and handling for pathnames and methods
  route(method, pathname, handle) {
    if (arguments.length === 1) [handle, method] = [method];
    if (arguments.length === 2) [handle, pathname] = [pathname];
    if (arguments.length === 2 && !Array.isArray(method) && method[0] === '/') [pathname, method] = [method];
    return _classPrivateMethodGet(this, _route, _route2).call(this, {
      priority: !pathname ? 0 : !method ? 1 : 2,
      methods: method && [].concat(method).map(m => m.toUpperCase()),
      match: pathname && pathToMatch(pathname),
      handle
    });
  } // install a route that serves requested files from the provided directory


  serve(pathname, directory, options) {
    var _options;

    if (typeof directory !== 'string') [options, directory] = [directory];
    if (!directory) [pathname, directory] = ['/', pathname];
    let root = path.resolve(directory);
    if (!fs.existsSync(root)) throw new Error(`Not found: ${directory}`);
    let mountPattern = pathToRegexp(pathname, null, {
      end: false
    });
    let rewritePath = createRewriter((_options = options) === null || _options === void 0 ? void 0 : _options.rewrites, (pathname, rewrite) => {
      try {
        let filepath = decodeURIComponent(pathname.replace(mountPattern, ''));
        if (!isPathInside(root, filepath)) ServerError.throw();
        return rewrite(filepath);
      } catch {
        throw new ServerError(400);
      }
    });
    return _classPrivateMethodGet(this, _route, _route2).call(this, {
      priority: 2,
      methods: ['GET'],
      match: pathname => mountPattern.test(pathname),
      handle: async (req, res, next) => {
        try {
          var _options2;

          let pathname = rewritePath(req.url.pathname);
          let file = await getFile(root, pathname, (_options2 = options) === null || _options2 === void 0 ? void 0 : _options2.cleanUrls);
          if (!(file !== null && file !== void 0 && file.stats.isFile())) return await next();
          return res.file(file.path);
        } catch (err) {
          let statusPage = path.join(root, `${err.status}.html`);
          if (!fs.existsSync(statusPage)) throw err;
          return res.file(err.status, statusPage);
        }
      }
    });
  } // route and respond to requests; handling errors if necessary


} // create a url rewriter from provided rewrite rules

function _handleUpgrade2(req, sock, head) {
  let up = _classPrivateFieldGet(this, _up).find(u => !u.match || u.match(req.url));

  if (up) return up.handle(req, sock, head);
  sock.write(`HTTP/1.1 400 ${http.STATUS_CODES[400]}\r\n` + 'Connection: close\r\n\r\n');
  sock.destroy();
}

function _route2(route) {
  let i = _classPrivateFieldGet(this, _routes).findIndex(r => r.priority >= route.priority);

  _classPrivateFieldGet(this, _routes).splice(i, 0, route);

  return this;
}

async function _handleRequest2(req, res) {
  // support node < 15.7.0
  res.req ?? (res.req = req);

  try {
    // invoke routes like middleware
    await async function cont(routes, i = 0) {
      let next = () => cont(routes, i + 1);

      let {
        methods,
        match,
        handle
      } = routes[i];
      let result = !methods || methods.includes(req.method);
      result && (result = !match || match(req.url.pathname));
      if (result) req.params = result.params;
      return result ? handle(req, res, next) : next();
    }(_classPrivateFieldGet(this, _routes));
  } catch (error) {
    var _req$headers$accept, _req$headers$content;

    let {
      status = 500,
      message
    } = error; // fallback error handling

    if ((_req$headers$accept = req.headers.accept) !== null && _req$headers$accept !== void 0 && _req$headers$accept.includes('json') || (_req$headers$content = req.headers['content-type']) !== null && _req$headers$content !== void 0 && _req$headers$content.includes('json')) {
      res.json(status, {
        error: message
      });
    } else {
      res.text(status, message);
    }
  }
}

function createRewriter(rewrites = [], cb) {
  let normalize = p => path.posix.normalize(path.posix.join('/', p));

  if (!Array.isArray(rewrites)) rewrites = Object.entries(rewrites);
  let rewrite = [{
    // resolve and normalize the path before rewriting
    apply: p => path.posix.resolve(normalize(p))
  }].concat(rewrites.map(([src, dest]) => {
    // compile rewrite rules into functions
    let match = pathToMatch(normalize(src));
    let toPath = makeToPath(normalize(dest));
    return {
      match,
      apply: r => toPath(r.params)
    };
  })).reduceRight((next, rule) => pathname => {
    var _rule$match;

    // compose all rewrites into a single function
    let result = ((_rule$match = rule.match) === null || _rule$match === void 0 ? void 0 : _rule$match.call(rule, pathname)) ?? pathname;
    if (result) pathname = rule.apply(result);
    return next(pathname);
  }, p => p); // allow additional pathname processing around the rewriter

  return p => cb(p, rewrite);
} // returns true if the pathname is inside the root pathname


function isPathInside(root, pathname) {
  let abs = path.resolve(path.join(root, pathname));
  return !abs.lastIndexOf(root, 0) && (abs[root.length] === path.sep || !abs[root.length]);
} // get the absolute path and stats of a possible file


async function getFile(root, pathname, cleanUrls) {
  for (let filename of [pathname].concat(cleanUrls ? path.join(pathname, 'index.html') : [], cleanUrls && pathname.length > 2 ? pathname.replace(/\/?$/, '.html') : [])) {
    let filepath = path.resolve(path.join(root, filename));
    let stats = await fs.promises.lstat(filepath).catch(() => {});
    if (stats !== null && stats !== void 0 && stats.isFile()) return {
      path: filepath,
      stats
    };
  }
} // returns the start and end of a byte range or undefined if unable to parse


const RANGE_REGEXP = /^bytes=(\d*)?-(\d*)?(?:\b|$)/;

function parseByteRange(range, size) {
  let [, start, end = size] = (range === null || range === void 0 ? void 0 : range.match(RANGE_REGEXP)) ?? [0, 0, 0];
  start = Math.max(parseInt(start, 10), 0);
  end = Math.min(parseInt(end, 10), size - 1);
  if (isNaN(start)) [start, end] = [size - end, size - 1];
  if (start >= 0 && start < end) return {
    start,
    end
  };
} // include ServerError and createRewriter as static properties


Server.Error = ServerError;
Server.createRewriter = createRewriter;
export default Server;