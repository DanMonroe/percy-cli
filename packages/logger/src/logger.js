import { colors } from './utils.js';

const URL_REGEXP = /\bhttps?:\/\/[^\s/$.?#].[^\s]*\b/i;
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// A PercyLogger instance retains logs in-memory for quick lookups while also writing log
// messages to stdout and stderr depending on the log level and debug string.
export class PercyLogger {
  // default log level
  level = 'info';

  // namespace regular expressions used to determine which debug logs to write
  namespaces = {
    include: [/^.*?$/],
    exclude: []
  };

  // in-memory store for logs and meta info
  messages = new Set();

  // track deprecations to limit noisy logging
  deprecations = new Set();

  // static vars can be overriden for testing
  static stdout = process.stdout;
  static stderr = process.stderr;

  // Handles setting env var values and returns a singleton
  constructor() {
    let { instance = this } = this.constructor;

    if (process.env.PERCY_DEBUG) {
      instance.debug(process.env.PERCY_DEBUG);
    } else if (process.env.PERCY_LOGLEVEL) {
      instance.loglevel(process.env.PERCY_LOGLEVEL);
    }

    this.constructor.instance = instance;
    return instance;
  }

  // Change log level at any time or return the current log level
  loglevel(level) {
    if (level) this.level = level;
    return this.level;
  }

  // Change namespaces by generating an array of namespace regular expressions from a
  // comma separated debug string
  debug(namespaces) {
    if (this.namespaces.string === namespaces) return;
    this.namespaces.string = namespaces;

    namespaces = namespaces.split(/[\s,]+/).filter(Boolean);
    if (!namespaces.length) return this.namespaces;
    this.loglevel('debug');

    this.namespaces = namespaces.reduce((namespaces, ns) => {
      ns = ns.replace(/:?\*/g, m => m[0] === ':' ? ':?.*?' : '.*?');

      if (ns[0] === '-') {
        namespaces.exclude.push(new RegExp('^' + ns.substr(1) + '$'));
      } else {
        namespaces.include.push(new RegExp('^' + ns + '$'));
      }

      return namespaces;
    }, {
      string: namespaces,
      include: [],
      exclude: []
    });
  }

  // Creates a new log group and returns level specific functions for logging
  group(name) {
    return Object.keys(LOG_LEVELS)
      .reduce((group, level) => Object.assign(group, {
        [level]: this.log.bind(this, name, level)
      }), {
        deprecated: this.deprecated.bind(this, name),
        shouldLog: this.shouldLog.bind(this, name),
        progress: this.progress.bind(this, name),
        format: this.format.bind(this, name),
        loglevel: this.loglevel.bind(this),
        stdout: this.constructor.stdout,
        stderr: this.constructor.stderr
      });
  }

  // Query for a set of logs by filtering the in-memory store
  query(filter) {
    return Array.from(this.messages).filter(filter);
  }

  // Formats messages before they are logged to stdio
  format(debug, level, message, elapsed) {
    let label = 'percy';
    let suffix = '';

    if (arguments.length === 1) {
      // format(message)
      [debug, message] = [null, debug];
    } else if (arguments.length === 2) {
      // format(debug, message)
      [level, message] = [null, level];
    }

    if (this.level === 'debug') {
      // include debug info in the label
      if (debug) label += `:${debug}`;

      // include elapsed time since last log
      if (elapsed != null) {
        suffix = ' ' + colors.grey(`(${elapsed}ms)`);
      }
    }

    label = colors.magenta(label);

    if (level === 'error') {
      // red errors
      message = colors.red(message);
    } else if (level === 'warn') {
      // yellow warnings
      message = colors.yellow(message);
    } else if (level === 'info' || level === 'debug') {
      // blue info and debug URLs
      message = message.replace(URL_REGEXP, colors.blue('$&'));
    }

    return `[${label}] ${message}${suffix}`;
  }

  // Replaces the current line with a log message
  progress(debug, message, persist) {
    if (!this.shouldLog(debug, 'info')) return;
    let { stdout } = this.constructor;

    if (stdout.isTTY || !this._progress) {
      message &&= this.format(debug, message);
      if (stdout.isTTY) stdout.cursorTo(0);
      else message &&= message + '\n';
      if (message) stdout.write(message);
      if (stdout.isTTY) stdout.clearLine(1);
    }

    this._progress = !!message && { message, persist };
  }

  // Returns true or false if the level and debug group can write messages to stdio
  shouldLog(debug, level) {
    return LOG_LEVELS[level] != null &&
      LOG_LEVELS[level] >= LOG_LEVELS[this.level] &&
      !this.namespaces.exclude.some(ns => ns.test(debug)) &&
      this.namespaces.include.some(ns => ns.test(debug));
  }

  // Ensures that deprecation messages are not logged more than once
  deprecated(debug, message, meta) {
    if (this.deprecations.has(message)) return;
    this.deprecations.add(message);

    this.log(debug, 'warn', `Warning: ${message}`, meta);
  }

  // Generic log method accepts a debug group, log level, log message, and optional meta
  // information to store with the message and other info
  log(debug, level, message, meta = {}) {
    // message might be an error-like object
    let err = typeof message !== 'string' && (level === 'debug' || level === 'error');
    err &&= message.message ? Error.prototype.toString.call(message) : message.toString();

    // save log entries
    let timestamp = Date.now();
    message = err ? (message.stack || err) : message.toString();
    let entry = { debug, level, message, meta, timestamp };
    this.messages.add(entry);

    // maybe write the message to stdio
    if (this.shouldLog(debug, level)) {
      if (err && this.level !== 'debug') message = err;
      let elapsed = timestamp - (this.lastlog || timestamp);
      this.write(level, this.format(debug, err ? 'error' : level, message, elapsed));
      this.lastlog = timestamp;
    }
  }

  // Writes a message to stdio based on the loglevel
  write(level, message) {
    let { stdout, stderr } = this.constructor;
    let progress = stdout.isTTY && this._progress;

    if (progress) {
      stdout.cursorTo(0);
      stdout.clearLine(0);
    }

    (level === 'info' ? stdout : stderr).write(message + '\n');
    if (!this._progress?.persist) delete this._progress;
    else if (progress) stdout.write(progress.message);
  }
}

export default PercyLogger;
