var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x2, y2, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// _worker.js/index.js
import("node:buffer").then(({ Buffer: Buffer2 }) => {
  globalThis.Buffer = Buffer2;
}).catch(() => null);
var __ALSes_PROMISE__ = import("node:async_hooks").then(({ AsyncLocalStorage }) => {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
  const envAsyncLocalStorage = new AsyncLocalStorage();
  const requestContextAsyncLocalStorage = new AsyncLocalStorage();
  globalThis.process = {
    env: new Proxy(
      {},
      {
        ownKeys: /* @__PURE__ */ __name(() => Reflect.ownKeys(envAsyncLocalStorage.getStore()), "ownKeys"),
        getOwnPropertyDescriptor: /* @__PURE__ */ __name((_2, ...args) => Reflect.getOwnPropertyDescriptor(envAsyncLocalStorage.getStore(), ...args), "getOwnPropertyDescriptor"),
        get: /* @__PURE__ */ __name((_2, property) => Reflect.get(envAsyncLocalStorage.getStore(), property), "get"),
        set: /* @__PURE__ */ __name((_2, property, value) => Reflect.set(envAsyncLocalStorage.getStore(), property, value), "set")
      }
    )
  };
  globalThis[/* @__PURE__ */ Symbol.for("__cloudflare-request-context__")] = new Proxy(
    {},
    {
      ownKeys: /* @__PURE__ */ __name(() => Reflect.ownKeys(requestContextAsyncLocalStorage.getStore()), "ownKeys"),
      getOwnPropertyDescriptor: /* @__PURE__ */ __name((_2, ...args) => Reflect.getOwnPropertyDescriptor(requestContextAsyncLocalStorage.getStore(), ...args), "getOwnPropertyDescriptor"),
      get: /* @__PURE__ */ __name((_2, property) => Reflect.get(requestContextAsyncLocalStorage.getStore(), property), "get"),
      set: /* @__PURE__ */ __name((_2, property, value) => Reflect.set(requestContextAsyncLocalStorage.getStore(), property, value), "set")
    }
  );
  return { envAsyncLocalStorage, requestContextAsyncLocalStorage };
}).catch(() => null);
var re = Object.create;
var H = Object.defineProperty;
var ne = Object.getOwnPropertyDescriptor;
var ae = Object.getOwnPropertyNames;
var oe = Object.getPrototypeOf;
var ie = Object.prototype.hasOwnProperty;
var k = /* @__PURE__ */ __name((e, t) => () => (e && (t = e(e = 0)), t), "k");
var V = /* @__PURE__ */ __name((e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports), "V");
var ce = /* @__PURE__ */ __name((e, t, r, s) => {
  if (t && typeof t == "object" || typeof t == "function") for (let a of ae(t)) !ie.call(e, a) && a !== r && H(e, a, { get: /* @__PURE__ */ __name(() => t[a], "get"), enumerable: !(s = ne(t, a)) || s.enumerable });
  return e;
}, "ce");
var q = /* @__PURE__ */ __name((e, t, r) => (r = e != null ? re(oe(e)) : {}, ce(t || !e || !e.__esModule ? H(r, "default", { value: e, enumerable: true }) : r, e)), "q");
var m;
var l = k(() => {
  m = { collectedLocales: [] };
});
var f;
var u = k(() => {
  f = { version: 3, routes: { none: [{ src: "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$", headers: { Location: "/$1" }, status: 308, continue: true }, { src: "^/_next/__private/trace$", dest: "/404", status: 404, continue: true }, { src: "^/404/?$", status: 404, continue: true, missing: [{ type: "header", key: "x-prerender-revalidate" }] }, { src: "^/500$", status: 500, continue: true }, { src: "^/(?<path>.+?)(?:/)?$", dest: "/$path.segments/$segmentPath.segment.rsc", has: [{ type: "header", key: "rsc", value: "1" }, { type: "header", key: "next-router-prefetch", value: "1" }, { type: "header", key: "next-router-segment-prefetch", value: "/(?<segmentPath>.+)" }], continue: true, override: true }, { src: "^/?$", dest: "/index.segments/$segmentPath.segment.rsc", has: [{ type: "header", key: "rsc", value: "1" }, { type: "header", key: "next-router-prefetch", value: "1" }, { type: "header", key: "next-router-segment-prefetch", value: "/(?<segmentPath>.+)" }], continue: true, override: true }, { src: "^/?$", has: [{ type: "header", key: "rsc", value: "1" }], dest: "/index.rsc", headers: { vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" }, continue: true, override: true }, { src: "^/((?!.+\\.rsc).+?)(?:/)?$", has: [{ type: "header", key: "rsc", value: "1" }], dest: "/$1.rsc", headers: { vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" }, continue: true, override: true }], filesystem: [{ src: "^/index(\\.action|\\.rsc)$", dest: "/", continue: true }, { src: "^/\\.prefetch\\.rsc$", dest: "/__index.prefetch.rsc", check: true }, { src: "^/(.+)/\\.prefetch\\.rsc$", dest: "/$1.prefetch.rsc", check: true }, { src: "^/\\.rsc$", dest: "/index.rsc", check: true }, { src: "^/(.+)/\\.rsc$", dest: "/$1.rsc", check: true }], miss: [{ src: "^/_next/static/.+$", status: 404, check: true, dest: "/_next/static/not-found.txt", headers: { "content-type": "text/plain; charset=utf-8" } }, { src: "^/(?<path>.+)(?<rscSuffix>\\.segments/.+\\.segment\\.rsc)(?:/)?$", dest: "/$path.rsc", check: true }], rewrite: [{ src: "^/(?<path>.+)(?<rscSuffix>\\.segments/.+\\.segment\\.rsc)(?:/)?$", dest: "/$path.rsc", check: true, override: true }], resource: [{ src: "^/.*$", status: 404 }], hit: [{ src: "^/_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media|C6iA6dKff7L5Pj8iUgP3x)/.+$", headers: { "cache-control": "public,max-age=31536000,immutable" }, continue: true, important: true }, { src: "^/index(?:/)?$", headers: { "x-matched-path": "/" }, continue: true, important: true }, { src: "^/((?!index$).*?)(?:/)?$", headers: { "x-matched-path": "/$1" }, continue: true, important: true }], error: [{ src: "^/.*$", dest: "/404", status: 404, headers: { "x-next-error-status": "404" } }, { src: "^/.*$", dest: "/500", status: 500, headers: { "x-next-error-status": "500" } }] }, images: { domains: [], sizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840, 32, 48, 64, 96, 128, 256, 384], qualities: [75], remotePatterns: [], localPatterns: [{ pathname: "^(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)\\/?)$", search: "" }], minimumCacheTTL: 14400, formats: ["image/webp"], dangerouslyAllowSVG: false, contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;", contentDispositionType: "attachment" }, overrides: { "404.html": { path: "404", contentType: "text/html; charset=utf-8" }, "500.html": { path: "500", contentType: "text/html; charset=utf-8" }, "404.rsc.json": { path: "404.rsc", contentType: "application/json" }, "404.segments/_tree.segment.rsc.json": { path: "404.segments/_tree.segment.rsc", contentType: "application/json" }, "500.rsc.json": { path: "500.rsc", contentType: "application/json" }, "500.segments/_tree.segment.rsc.json": { path: "500.segments/_tree.segment.rsc", contentType: "application/json" }, "favicon.ico": { contentType: "image/x-icon" }, "_next/static/not-found.txt": { contentType: "text/plain" } }, framework: { slug: "nextjs", version: "16.3.8" }, crons: [] };
});
var _;
var p = k(() => {
  _ = { "/404.html": { type: "override", path: "/404.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/404.rsc.json": { type: "override", path: "/404.rsc.json", headers: { "content-type": "application/json" } }, "/404.segments/_tree.segment.rsc.json": { type: "override", path: "/404.segments/_tree.segment.rsc.json", headers: { "content-type": "application/json" } }, "/500.html": { type: "override", path: "/500.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/500.rsc.json": { type: "override", path: "/500.rsc.json", headers: { "content-type": "application/json" } }, "/500.segments/_tree.segment.rsc.json": { type: "override", path: "/500.segments/_tree.segment.rsc.json", headers: { "content-type": "application/json" } }, "/_next/static/C6iA6dKff7L5Pj8iUgP3x/_buildManifest.js": { type: "static" }, "/_next/static/C6iA6dKff7L5Pj8iUgP3x/_clientMiddlewareManifest.js": { type: "static" }, "/_next/static/C6iA6dKff7L5Pj8iUgP3x/_ssgManifest.js": { type: "static" }, "/_next/static/chunks/0cz1d0mv5g_q7.js": { type: "static" }, "/_next/static/chunks/0ij0onxt61-mf.js": { type: "static" }, "/_next/static/chunks/0j-j5hc7strin.js": { type: "static" }, "/_next/static/chunks/0q5zrvgl8_-6m.js": { type: "static" }, "/_next/static/chunks/1dj5ypqx_-m6r.js": { type: "static" }, "/_next/static/chunks/1pomsvqlx0p4y.js": { type: "static" }, "/_next/static/chunks/24grgw1d4odg5.js": { type: "static" }, "/_next/static/chunks/28aai94kjehvw.css": { type: "static" }, "/_next/static/chunks/3d-1vk5hzu5rq.css": { type: "static" }, "/_next/static/chunks/3fntmmi971322.js": { type: "static" }, "/_next/static/chunks/turbopack-0rsfl_1c7fvvk.js": { type: "static" }, "/_next/static/media/4fa387ec64143e14-s.2tuy5pz7dlieh.woff2": { type: "static" }, "/_next/static/media/53b9e256198e5412-s.390ncx5urfkfu.woff2": { type: "static" }, "/_next/static/media/5ce348bf30bf5439-s.31988l_ccedte.woff2": { type: "static" }, "/_next/static/media/6306c77e7c8268e4-s.2dbetqa9o8jxf.woff2": { type: "static" }, "/_next/static/media/7178b3e590c64307-s.21jp631_3pja2.woff2": { type: "static" }, "/_next/static/media/797e433ab948586e-s.p.0r6juujl39pe6.woff2": { type: "static" }, "/_next/static/media/7d817b4c03b0c5f1-s.1uyisp29ctx0d.woff2": { type: "static" }, "/_next/static/media/8a480f0b521d4e75-s.1qq4vpdcun5oj.woff2": { type: "static" }, "/_next/static/media/bbc41e54d2fcbd21-s.1rgnod-3esatf.woff2": { type: "static" }, "/_next/static/media/caa3a2e1cccd8315-s.p.0wgildi0cnwt9.woff2": { type: "static" }, "/_next/static/media/favicon.2vob68tjqpejf.ico": { type: "static" }, "/_next/static/media/fef07dbb0973bf53-s.3p2_lha1f2xer.woff2": { type: "static" }, "/_next/static/not-found.txt": { type: "static" }, "/favicon.ico": { type: "override", path: "/favicon.ico", headers: { "content-type": "image/x-icon" } }, "/file.svg": { type: "static" }, "/globe.svg": { type: "static" }, "/manifest.json": { type: "static" }, "/next.svg": { type: "static" }, "/sw.js": { type: "static" }, "/vercel.svg": { type: "static" }, "/window.svg": { type: "static" }, "/api/analyze-word": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/analyze-word.func.js" }, "/api/analyze-word.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/analyze-word.func.js" }, "/api/translate-text": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/translate-text.func.js" }, "/api/translate-text.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/translate-text.func.js" }, "/api/translate": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/translate.func.js" }, "/api/translate.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/translate.func.js" }, "/api/tts": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/tts.func.js" }, "/api/tts.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/tts.func.js" }, "/404": { type: "override", path: "/404.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/500": { type: "override", path: "/500.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/404.rsc": { type: "override", path: "/404.rsc.json", headers: { "content-type": "application/json" } }, "/404.segments/_tree.segment.rsc": { type: "override", path: "/404.segments/_tree.segment.rsc.json", headers: { "content-type": "application/json" } }, "/500.rsc": { type: "override", path: "/500.rsc.json", headers: { "content-type": "application/json" } }, "/500.segments/_tree.segment.rsc": { type: "override", path: "/500.segments/_tree.segment.rsc.json", headers: { "content-type": "application/json" } }, "/": { type: "override", path: "/index.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_global-error.html": { type: "override", path: "/_global-error.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_global-error/layout,_N_T_/_global-error/page,_N_T_/_global-error", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_global-error": { type: "override", path: "/_global-error.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_global-error/layout,_N_T_/_global-error/page,_N_T_/_global-error", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_global-error.rsc": { type: "override", path: "/_global-error.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_global-error/layout,_N_T_/_global-error/page,_N_T_/_global-error", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component" } }, "/_global-error.segments/__PAGE__.segment.rsc": { type: "override", path: "/_global-error.segments/__PAGE__.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_global-error/layout,_N_T_/_global-error/page,_N_T_/_global-error", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/_global-error.segments/_full.segment.rsc": { type: "override", path: "/_global-error.segments/_full.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_global-error/layout,_N_T_/_global-error/page,_N_T_/_global-error", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/_global-error.segments/_tree.segment.rsc": { type: "override", path: "/_global-error.segments/_tree.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_global-error/layout,_N_T_/_global-error/page,_N_T_/_global-error", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/_not-found.html": { type: "override", path: "/_not-found.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_not-found": { type: "override", path: "/_not-found.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_not-found.rsc": { type: "override", path: "/_not-found.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component" } }, "/_not-found.segments/_full.segment.rsc": { type: "override", path: "/_not-found.segments/_full.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/_not-found.segments/_not-found/__PAGE__.segment.rsc": { type: "override", path: "/_not-found.segments/_not-found/__PAGE__.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/_not-found.segments/_tree.segment.rsc": { type: "override", path: "/_not-found.segments/_tree.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/index.html": { type: "override", path: "/index.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/index": { type: "override", path: "/index.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/index.rsc": { type: "override", path: "/index.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component" } }, "/index.segments/__PAGE__.segment.rsc": { type: "override", path: "/index.segments/__PAGE__.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/index.segments/_full.segment.rsc": { type: "override", path: "/index.segments/_full.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } }, "/index.segments/_tree.segment.rsc": { type: "override", path: "/index.segments/_tree.segment.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/page,_N_T_/,_N_T_/index", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component", "x-nextjs-postponed": "2" } } };
});
var F = V((We, $) => {
  "use strict";
  l();
  u();
  p();
  function w(e, t) {
    e = String(e || "").trim();
    let r = e, s, a = "";
    if (/^[^a-zA-Z\\\s]/.test(e)) {
      s = e[0];
      let i = e.lastIndexOf(s);
      a += e.substring(i + 1), e = e.substring(1, i);
    }
    let n = 0;
    return e = pe(e, (i) => {
      if (/^\(\?[P<']/.test(i)) {
        let c = /^\(\?P?[<']([^>']+)[>']/.exec(i);
        if (!c) throw new Error(`Failed to extract named captures from ${JSON.stringify(i)}`);
        let d = i.substring(c[0].length, i.length - 1);
        return t && (t[n] = c[1]), n++, `(${d})`;
      }
      return i.substring(0, 3) === "(?:" || n++, i;
    }), e = e.replace(/\[:([^:]+):\]/g, (i, c) => w.characterClasses[c] || i), new w.PCRE(e, a, r, a, s);
  }
  __name(w, "w");
  function pe(e, t) {
    let r = 0, s = 0, a = false;
    for (let o = 0; o < e.length; o++) {
      let n = e[o];
      if (a) {
        a = false;
        continue;
      }
      switch (n) {
        case "(":
          s === 0 && (r = o), s++;
          break;
        case ")":
          if (s > 0 && (s--, s === 0)) {
            let i = o + 1, c = r === 0 ? "" : e.substring(0, r), d = e.substring(i), h = String(t(e.substring(r, i)));
            e = c + h + d, o = r;
          }
          break;
        case "\\":
          a = true;
          break;
        default:
          break;
      }
    }
    return e;
  }
  __name(pe, "pe");
  (function(e) {
    class t extends RegExp {
      static {
        __name(this, "t");
      }
      constructor(s, a, o, n, i) {
        super(s, a), this.pcrePattern = o, this.pcreFlags = n, this.delimiter = i;
      }
    }
    e.PCRE = t, e.characterClasses = { alnum: "[A-Za-z0-9]", word: "[A-Za-z0-9_]", alpha: "[A-Za-z]", blank: "[ \\t]", cntrl: "[\\x00-\\x1F\\x7F]", digit: "\\d", graph: "[\\x21-\\x7E]", lower: "[a-z]", print: "[\\x20-\\x7E]", punct: "[\\]\\[!\"#$%&'()*+,./:;<=>?@\\\\^_`{|}~-]", space: "\\s", upper: "[A-Z]", xdigit: "[A-Fa-f0-9]" };
  })(w || (w = {}));
  w.prototype = w.PCRE.prototype;
  $.exports = w;
});
var Q = V((U) => {
  "use strict";
  l();
  u();
  p();
  U.parse = be;
  U.serialize = Pe;
  var ve = Object.prototype.toString, j = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
  function be(e, t) {
    if (typeof e != "string") throw new TypeError("argument str must be a string");
    for (var r = {}, s = t || {}, a = s.decode || Te, o = 0; o < e.length; ) {
      var n = e.indexOf("=", o);
      if (n === -1) break;
      var i = e.indexOf(";", o);
      if (i === -1) i = e.length;
      else if (i < n) {
        o = e.lastIndexOf(";", n - 1) + 1;
        continue;
      }
      var c = e.slice(o, n).trim();
      if (r[c] === void 0) {
        var d = e.slice(n + 1, i).trim();
        d.charCodeAt(0) === 34 && (d = d.slice(1, -1)), r[c] = Ce(d, a);
      }
      o = i + 1;
    }
    return r;
  }
  __name(be, "be");
  function Pe(e, t, r) {
    var s = r || {}, a = s.encode || Se;
    if (typeof a != "function") throw new TypeError("option encode is invalid");
    if (!j.test(e)) throw new TypeError("argument name is invalid");
    var o = a(t);
    if (o && !j.test(o)) throw new TypeError("argument val is invalid");
    var n = e + "=" + o;
    if (s.maxAge != null) {
      var i = s.maxAge - 0;
      if (isNaN(i) || !isFinite(i)) throw new TypeError("option maxAge is invalid");
      n += "; Max-Age=" + Math.floor(i);
    }
    if (s.domain) {
      if (!j.test(s.domain)) throw new TypeError("option domain is invalid");
      n += "; Domain=" + s.domain;
    }
    if (s.path) {
      if (!j.test(s.path)) throw new TypeError("option path is invalid");
      n += "; Path=" + s.path;
    }
    if (s.expires) {
      var c = s.expires;
      if (!Ne(c) || isNaN(c.valueOf())) throw new TypeError("option expires is invalid");
      n += "; Expires=" + c.toUTCString();
    }
    if (s.httpOnly && (n += "; HttpOnly"), s.secure && (n += "; Secure"), s.priority) {
      var d = typeof s.priority == "string" ? s.priority.toLowerCase() : s.priority;
      switch (d) {
        case "low":
          n += "; Priority=Low";
          break;
        case "medium":
          n += "; Priority=Medium";
          break;
        case "high":
          n += "; Priority=High";
          break;
        default:
          throw new TypeError("option priority is invalid");
      }
    }
    if (s.sameSite) {
      var h = typeof s.sameSite == "string" ? s.sameSite.toLowerCase() : s.sameSite;
      switch (h) {
        case true:
          n += "; SameSite=Strict";
          break;
        case "lax":
          n += "; SameSite=Lax";
          break;
        case "strict":
          n += "; SameSite=Strict";
          break;
        case "none":
          n += "; SameSite=None";
          break;
        default:
          throw new TypeError("option sameSite is invalid");
      }
    }
    return n;
  }
  __name(Pe, "Pe");
  function Te(e) {
    return e.indexOf("%") !== -1 ? decodeURIComponent(e) : e;
  }
  __name(Te, "Te");
  function Se(e) {
    return encodeURIComponent(e);
  }
  __name(Se, "Se");
  function Ne(e) {
    return ve.call(e) === "[object Date]" || e instanceof Date;
  }
  __name(Ne, "Ne");
  function Ce(e, t) {
    try {
      return t(e);
    } catch {
      return e;
    }
  }
  __name(Ce, "Ce");
});
l();
u();
p();
l();
u();
p();
l();
u();
p();
var v = "INTERNAL_SUSPENSE_CACHE_HOSTNAME.local";
l();
u();
p();
l();
u();
p();
l();
u();
p();
l();
u();
p();
var D = q(F());
function S(e, t, r) {
  if (t == null) return { match: null, captureGroupKeys: [] };
  let s = r ? "" : "i", a = [];
  return { match: (0, D.default)(`%${e}%${s}`, a).exec(t), captureGroupKeys: a };
}
__name(S, "S");
function b(e, t, r, { namedOnly: s } = {}) {
  return e.replace(/\$([a-zA-Z0-9_]+)/g, (a, o) => {
    let n = r.indexOf(o);
    return s && n === -1 ? a : (n === -1 ? t[parseInt(o, 10)] : t[n + 1]) || "";
  });
}
__name(b, "b");
function A(e, { url: t, cookies: r, headers: s, routeDest: a }) {
  switch (e.type) {
    case "host":
      return { valid: t.hostname === e.value };
    case "header":
      return e.value !== void 0 ? M(e.value, s.get(e.key), a) : { valid: s.has(e.key) };
    case "cookie": {
      let o = r[e.key];
      return o && e.value !== void 0 ? M(e.value, o, a) : { valid: o !== void 0 };
    }
    case "query":
      return e.value !== void 0 ? M(e.value, t.searchParams.get(e.key), a) : { valid: t.searchParams.has(e.key) };
  }
}
__name(A, "A");
function M(e, t, r) {
  let { match: s, captureGroupKeys: a } = S(e, t);
  return r && s && a.length ? { valid: !!s, newRouteDest: b(r, s, a, { namedOnly: true }) } : { valid: !!s };
}
__name(M, "M");
l();
u();
p();
function G(e) {
  let t = new Headers(e.headers);
  return e.cf && (t.set("x-vercel-ip-city", encodeURIComponent(e.cf.city)), t.set("x-vercel-ip-country", e.cf.country), t.set("x-vercel-ip-country-region", e.cf.regionCode), t.set("x-vercel-ip-latitude", e.cf.latitude), t.set("x-vercel-ip-longitude", e.cf.longitude)), t.set("x-vercel-sc-host", v), new Request(e, { headers: t });
}
__name(G, "G");
l();
u();
p();
function x(e, t, r) {
  let s = t instanceof Headers ? t.entries() : Object.entries(t);
  for (let [a, o] of s) {
    let n = a.toLowerCase(), i = r?.match ? b(o, r.match, r.captureGroupKeys) : o;
    n === "set-cookie" ? e.append(n, i) : e.set(n, i);
  }
}
__name(x, "x");
function P(e) {
  return /^https?:\/\//.test(e);
}
__name(P, "P");
function y(e, t) {
  for (let [r, s] of t.entries()) {
    let a = /^nxtP(.+)$/.exec(r), o = /^nxtI(.+)$/.exec(r);
    a?.[1] ? (e.set(r, s), e.set(a[1], s)) : o?.[1] ? e.set(o[1], s.replace(/(\(\.+\))+/, "")) : (!e.has(r) || !!s && !e.getAll(r).includes(s)) && e.append(r, s);
  }
}
__name(y, "y");
function I(e, t) {
  let r = new URL(t, e.url);
  return y(r.searchParams, new URL(e.url).searchParams), r.pathname = r.pathname.replace(/\/index.html$/, "/").replace(/\.html$/, ""), new Request(r, e);
}
__name(I, "I");
function T(e) {
  return new Response(e.body, e);
}
__name(T, "T");
function L(e) {
  return e.split(",").map((t) => {
    let [r, s] = t.split(";"), a = parseFloat((s ?? "q=1").replace(/q *= */gi, ""));
    return [r.trim(), isNaN(a) ? 1 : a];
  }).sort((t, r) => r[1] - t[1]).map(([t]) => t === "*" || t === "" ? [] : t).flat();
}
__name(L, "L");
l();
u();
p();
function O(e) {
  switch (e) {
    case "none":
      return "filesystem";
    case "filesystem":
      return "rewrite";
    case "rewrite":
      return "resource";
    case "resource":
      return "miss";
    default:
      return "miss";
  }
}
__name(O, "O");
async function N(e, { request: t, assetsFetcher: r, ctx: s }, { path: a, searchParams: o }) {
  let n, i = new URL(t.url);
  y(i.searchParams, o);
  let c = new Request(i, t);
  try {
    switch (e?.type) {
      case "function":
      case "middleware": {
        let d = await import(e.entrypoint);
        try {
          n = await d.default(c, s);
        } catch (h) {
          let g = h;
          throw g.name === "TypeError" && g.message.endsWith("default is not a function") ? new Error(`An error occurred while evaluating the target edge function (${e.entrypoint})`) : h;
        }
        break;
      }
      case "override": {
        n = T(await r.fetch(I(c, e.path ?? a))), e.headers && x(n.headers, e.headers);
        break;
      }
      case "static": {
        n = await r.fetch(I(c, a));
        break;
      }
      default:
        n = new Response("Not Found", { status: 404 });
    }
  } catch (d) {
    return console.error(d), new Response("Internal Server Error", { status: 500 });
  }
  return T(n);
}
__name(N, "N");
function B(e, t) {
  let r = "^//?(?:", s = ")/(.*)$";
  return !e.startsWith(r) || !e.endsWith(s) ? false : e.slice(r.length, -s.length).split("|").every((o) => t.has(o));
}
__name(B, "B");
l();
u();
p();
function de(e, { protocol: t, hostname: r, port: s, pathname: a }) {
  return !(t && e.protocol.replace(/:$/, "") !== t || !new RegExp(r).test(e.hostname) || s && !new RegExp(s).test(e.port) || a && !new RegExp(a).test(e.pathname));
}
__name(de, "de");
function he(e, t) {
  if (e.method !== "GET") return;
  let { origin: r, searchParams: s } = new URL(e.url), a = s.get("url"), o = Number.parseInt(s.get("w") ?? "", 10), n = Number.parseInt(s.get("q") ?? "75", 10);
  if (!a || Number.isNaN(o) || Number.isNaN(n) || !t?.sizes?.includes(o) || n < 0 || n > 100) return;
  let i = new URL(a, r);
  if (i.pathname.endsWith(".svg") && !t?.dangerouslyAllowSVG) return;
  let c = a.startsWith("//"), d = a.startsWith("/") && !c;
  if (!d && !t?.domains?.includes(i.hostname) && !t?.remotePatterns?.find((R) => de(i, R))) return;
  let h = e.headers.get("Accept") ?? "", g = t?.formats?.find((R) => h.includes(R))?.replace("image/", "");
  return { isRelative: d, imageUrl: i, options: { width: o, quality: n, format: g } };
}
__name(he, "he");
function fe(e, t, r) {
  let s = new Headers();
  if (r?.contentSecurityPolicy && s.set("Content-Security-Policy", r.contentSecurityPolicy), r?.contentDispositionType) {
    let o = t.pathname.split("/").pop(), n = o ? `${r.contentDispositionType}; filename="${o}"` : r.contentDispositionType;
    s.set("Content-Disposition", n);
  }
  e.headers.has("Cache-Control") || s.set("Cache-Control", `public, max-age=${r?.minimumCacheTTL ?? 60}`);
  let a = T(e);
  return x(a.headers, s), a;
}
__name(fe, "fe");
async function z(e, { buildOutput: t, assetsFetcher: r, imagesConfig: s }) {
  let a = he(e, s);
  if (!a) return new Response("Invalid image resizing request", { status: 400 });
  let { isRelative: o, imageUrl: n } = a, c = await (o && n.pathname in t ? r.fetch.bind(r) : fetch)(n);
  return fe(c, n, s);
}
__name(z, "z");
l();
u();
p();
l();
u();
p();
l();
u();
p();
async function C(e) {
  return import(e);
}
__name(C, "C");
var _e = "x-vercel-cache-tags";
var me = "x-next-cache-soft-tags";
var ge = /* @__PURE__ */ Symbol.for("__cloudflare-request-context__");
async function J(e) {
  let t = `https://${v}/v1/suspense-cache/`;
  if (!e.url.startsWith(t)) return null;
  try {
    let r = new URL(e.url), s = await xe();
    if (r.pathname === "/v1/suspense-cache/revalidate") {
      let o = r.searchParams.get("tags")?.split(",") ?? [];
      for (let n of o) await s.revalidateTag(n);
      return new Response(null, { status: 200 });
    }
    let a = r.pathname.replace("/v1/suspense-cache/", "");
    if (!a.length) return new Response("Invalid cache key", { status: 400 });
    switch (e.method) {
      case "GET": {
        let o = W(e, me), n = await s.get(a, { softTags: o });
        return n ? new Response(JSON.stringify(n.value), { status: 200, headers: { "Content-Type": "application/json", "x-vercel-cache-state": "fresh", age: `${(Date.now() - (n.lastModified ?? Date.now())) / 1e3}` } }) : new Response(null, { status: 404 });
      }
      case "POST": {
        let o = globalThis[ge], n = /* @__PURE__ */ __name(async () => {
          let i = await e.json();
          i.data.tags === void 0 && (i.tags ??= W(e, _e) ?? []), await s.set(a, i);
        }, "n");
        return o ? o.ctx.waitUntil(n()) : await n(), new Response(null, { status: 200 });
      }
      default:
        return new Response(null, { status: 405 });
    }
  } catch (r) {
    return console.error(r), new Response("Error handling cache request", { status: 500 });
  }
}
__name(J, "J");
async function xe() {
  return process.env.__NEXT_ON_PAGES__KV_SUSPENSE_CACHE ? K("kv") : K("cache-api");
}
__name(xe, "xe");
async function K(e) {
  let t = `./__next-on-pages-dist__/cache/${e}.js`, r = await C(t);
  return new r.default();
}
__name(K, "K");
function W(e, t) {
  return e.headers.get(t)?.split(",")?.filter(Boolean);
}
__name(W, "W");
function X() {
  globalThis[Z] || (ye(), globalThis[Z] = true);
}
__name(X, "X");
function ye() {
  let e = globalThis.fetch;
  globalThis.fetch = async (...t) => {
    let r = new Request(...t), s = await we(r);
    return s || (s = await J(r), s) ? s : (Re(r), e(r));
  };
}
__name(ye, "ye");
async function we(e) {
  if (e.url.startsWith("blob:")) try {
    let r = `./__next-on-pages-dist__/assets/${new URL(e.url).pathname}.bin`, s = (await C(r)).default, a = { async arrayBuffer() {
      return s;
    }, get body() {
      return new ReadableStream({ start(o) {
        let n = Buffer.from(s);
        o.enqueue(n), o.close();
      } });
    }, async text() {
      return Buffer.from(s).toString();
    }, async json() {
      let o = Buffer.from(s);
      return JSON.stringify(o.toString());
    }, async blob() {
      return new Blob(s);
    } };
    return a.clone = () => ({ ...a }), a;
  } catch {
  }
  return null;
}
__name(we, "we");
function Re(e) {
  e.headers.has("user-agent") || e.headers.set("user-agent", "Next.js Middleware");
}
__name(Re, "Re");
var Z = /* @__PURE__ */ Symbol.for("next-on-pages fetch patch");
l();
u();
p();
var Y = q(Q());
var E = class {
  static {
    __name(this, "E");
  }
  constructor(t, r, s, a, o) {
    this.routes = t;
    this.output = r;
    this.reqCtx = s;
    this.url = new URL(s.request.url), this.cookies = (0, Y.parse)(s.request.headers.get("cookie") || ""), this.path = this.url.pathname || "/", this.headers = { normal: new Headers(), important: new Headers() }, this.searchParams = new URLSearchParams(), y(this.searchParams, this.url.searchParams), this.checkPhaseCounter = 0, this.middlewareInvoked = [], this.wildcardMatch = o?.find((n) => n.domain === this.url.hostname), this.locales = new Set(a.collectedLocales);
  }
  url;
  cookies;
  wildcardMatch;
  path;
  status;
  headers;
  searchParams;
  body;
  checkPhaseCounter;
  middlewareInvoked;
  locales;
  checkRouteMatch(t, { checkStatus: r, checkIntercept: s }) {
    let a = S(t.src, this.path, t.caseSensitive);
    if (!a.match || t.methods && !t.methods.map((n) => n.toUpperCase()).includes(this.reqCtx.request.method.toUpperCase())) return;
    let o = { url: this.url, cookies: this.cookies, headers: this.reqCtx.request.headers, routeDest: t.dest };
    if (!t.has?.find((n) => {
      let i = A(n, o);
      return i.newRouteDest && (o.routeDest = i.newRouteDest), !i.valid;
    }) && !t.missing?.find((n) => A(n, o).valid) && !(r && t.status !== this.status)) {
      if (s && t.dest) {
        let n = /\/(\(\.+\))+/, i = n.test(t.dest), c = n.test(this.path);
        if (i && !c) return;
      }
      return { routeMatch: a, routeDest: o.routeDest };
    }
  }
  processMiddlewareResp(t) {
    let r = "x-middleware-override-headers", s = t.headers.get(r);
    if (s) {
      let c = new Set(s.split(",").map((d) => d.trim()));
      for (let d of c.keys()) {
        let h = `x-middleware-request-${d}`, g = t.headers.get(h);
        this.reqCtx.request.headers.get(d) !== g && (g ? this.reqCtx.request.headers.set(d, g) : this.reqCtx.request.headers.delete(d)), t.headers.delete(h);
      }
      t.headers.delete(r);
    }
    let a = "x-middleware-rewrite", o = t.headers.get(a);
    if (o) {
      let c = new URL(o, this.url), d = this.url.hostname !== c.hostname;
      this.path = d ? `${c}` : c.pathname, y(this.searchParams, c.searchParams), t.headers.delete(a);
    }
    let n = "x-middleware-next";
    t.headers.get(n) ? t.headers.delete(n) : !o && !t.headers.has("location") ? (this.body = t.body, this.status = t.status) : t.headers.has("location") && t.status >= 300 && t.status < 400 && (this.status = t.status), x(this.reqCtx.request.headers, t.headers), x(this.headers.normal, t.headers), this.headers.middlewareLocation = t.headers.get("location");
  }
  async runRouteMiddleware(t) {
    if (!t) return true;
    let r = t && this.output[t];
    if (!r || r.type !== "middleware") return this.status = 500, false;
    let s = await N(r, this.reqCtx, { path: this.path, searchParams: this.searchParams, headers: this.headers, status: this.status });
    return this.middlewareInvoked.push(t), s.status === 500 ? (this.status = s.status, false) : (this.processMiddlewareResp(s), true);
  }
  applyRouteOverrides(t) {
    !t.override || (this.status = void 0, this.headers.normal = new Headers(), this.headers.important = new Headers());
  }
  applyRouteHeaders(t, r, s) {
    !t.headers || (x(this.headers.normal, t.headers, { match: r, captureGroupKeys: s }), t.important && x(this.headers.important, t.headers, { match: r, captureGroupKeys: s }));
  }
  applyRouteStatus(t) {
    !t.status || (this.status = t.status);
  }
  applyRouteDest(t, r, s) {
    if (!t.dest) return this.path;
    let a = this.path, o = t.dest;
    this.wildcardMatch && /\$wildcard/.test(o) && (o = o.replace(/\$wildcard/g, this.wildcardMatch.value)), this.path = b(o, r, s);
    let n = /\/index\.rsc$/i.test(this.path), i = /^\/(?:index)?$/i.test(a), c = /^\/__index\.prefetch\.rsc$/i.test(a);
    n && !i && !c && (this.path = a);
    let d = /\.rsc$/i.test(this.path), h = /\.prefetch\.rsc$/i.test(this.path), g = this.path in this.output;
    d && !h && !g && (this.path = this.path.replace(/\.rsc/i, ""));
    let R = new URL(this.path, this.url);
    return y(this.searchParams, R.searchParams), P(this.path) || (this.path = R.pathname), a;
  }
  applyLocaleRedirects(t) {
    if (!t.locale?.redirect || !/^\^(.)*$/.test(t.src) && t.src !== this.path || this.headers.normal.has("location")) return;
    let { locale: { redirect: s, cookie: a } } = t, o = a && this.cookies[a], n = L(o ?? ""), i = L(this.reqCtx.request.headers.get("accept-language") ?? ""), h = [...n, ...i].map((g) => s[g]).filter(Boolean)[0];
    if (h) {
      !this.path.startsWith(h) && (this.headers.normal.set("location", h), this.status = 307);
      return;
    }
  }
  getLocaleFriendlyRoute(t, r) {
    return !this.locales || r !== "miss" ? t : B(t.src, this.locales) ? { ...t, src: t.src.replace(/\/\(\.\*\)\$$/, "(?:/(.*))?$") } : t;
  }
  async checkRoute(t, r) {
    let s = this.getLocaleFriendlyRoute(r, t), { routeMatch: a, routeDest: o } = this.checkRouteMatch(s, { checkStatus: t === "error", checkIntercept: t === "rewrite" }) ?? {}, n = { ...s, dest: o };
    if (!a?.match || n.middlewarePath && this.middlewareInvoked.includes(n.middlewarePath)) return "skip";
    let { match: i, captureGroupKeys: c } = a;
    if (this.applyRouteOverrides(n), this.applyLocaleRedirects(n), !await this.runRouteMiddleware(n.middlewarePath)) return "error";
    if (this.body !== void 0 || this.headers.middlewareLocation) return "done";
    this.applyRouteHeaders(n, i, c), this.applyRouteStatus(n);
    let h = this.applyRouteDest(n, i, c);
    if (n.check && !P(this.path)) if (h === this.path) {
      if (t !== "miss") return this.checkPhase(O(t));
      this.status = 404;
    } else if (t === "miss") {
      if (!(this.path in this.output) && !(this.path.replace(/\/$/, "") in this.output)) return this.checkPhase("filesystem");
      this.status === 404 && (this.status = void 0);
    } else return this.checkPhase("none");
    return !n.continue || n.status && n.status >= 300 && n.status <= 399 ? "done" : "next";
  }
  async checkPhase(t) {
    if (this.checkPhaseCounter++ >= 50) return console.error(`Routing encountered an infinite loop while checking ${this.url.pathname}`), this.status = 500, "error";
    this.middlewareInvoked = [];
    let r = true;
    for (let o of this.routes[t]) {
      let n = await this.checkRoute(t, o);
      if (n === "error") return "error";
      if (n === "done") {
        r = false;
        break;
      }
    }
    if (t === "hit" || P(this.path) || this.headers.normal.has("location") || !!this.body) return "done";
    if (t === "none") for (let o of this.locales) {
      let n = new RegExp(`/${o}(/.*)`), c = this.path.match(n)?.[1];
      if (c && c in this.output) {
        this.path = c;
        break;
      }
    }
    let s = this.path in this.output;
    if (!s && this.path.endsWith("/")) {
      let o = this.path.replace(/\/$/, "");
      s = o in this.output, s && (this.path = o);
    }
    if (t === "miss" && !s) {
      let o = !this.status || this.status < 400;
      this.status = o ? 404 : this.status;
    }
    let a = "miss";
    return s || t === "miss" || t === "error" ? a = "hit" : r && (a = O(t)), this.checkPhase(a);
  }
  async run(t = "none") {
    this.checkPhaseCounter = 0;
    let r = await this.checkPhase(t);
    return this.headers.normal.has("location") && (!this.status || this.status < 300 || this.status >= 400) && (this.status = 307), r;
  }
};
async function ee(e, t, r, s) {
  let a = new E(t.routes, r, e, s, t.wildcard), o = await te(a);
  return je(e, o, r);
}
__name(ee, "ee");
async function te(e, t = "none", r = false) {
  return await e.run(t) === "error" || !r && e.status && e.status >= 400 ? te(e, "error", true) : { path: e.path, status: e.status, headers: e.headers, searchParams: e.searchParams, body: e.body };
}
__name(te, "te");
async function je(e, { path: t = "/404", status: r, headers: s, searchParams: a, body: o }, n) {
  let i = s.normal.get("location");
  if (i) {
    if (i !== s.middlewareLocation) {
      let h = [...a.keys()].length ? `?${a.toString()}` : "";
      s.normal.set("location", `${i ?? "/"}${h}`);
    }
    return new Response(null, { status: r, headers: s.normal });
  }
  let c;
  if (o !== void 0) c = new Response(o, { status: r });
  else if (P(t)) {
    let h = new URL(t);
    y(h.searchParams, a), c = await fetch(h, e.request);
  } else c = await N(n[t], e, { path: t, status: r, headers: s, searchParams: a });
  let d = s.normal;
  return x(d, c.headers), x(d, s.important), c = new Response(c.body, { ...c, status: r || c.status, headers: d }), c;
}
__name(je, "je");
l();
u();
p();
function se() {
  globalThis.__nextOnPagesRoutesIsolation ??= { _map: /* @__PURE__ */ new Map(), getProxyFor: Ee };
}
__name(se, "se");
function Ee(e) {
  let t = globalThis.__nextOnPagesRoutesIsolation._map.get(e);
  if (t) return t;
  let r = ke();
  return globalThis.__nextOnPagesRoutesIsolation._map.set(e, r), r;
}
__name(Ee, "Ee");
function ke() {
  let e = /* @__PURE__ */ new Map();
  return new Proxy(globalThis, { get: /* @__PURE__ */ __name((t, r) => e.has(r) ? e.get(r) : Reflect.get(globalThis, r), "get"), set: /* @__PURE__ */ __name((t, r, s) => Me.has(r) ? Reflect.set(globalThis, r, s) : (e.set(r, s), true), "set") });
}
__name(ke, "ke");
var Me = /* @__PURE__ */ new Set(["_nextOriginalFetch", "fetch", "__incrementalCache"]);
var Ae = Object.defineProperty;
var Ie = /* @__PURE__ */ __name((...e) => {
  let t = e[0], r = e[1], s = "__import_unsupported";
  if (!(r === s && typeof t == "object" && t !== null && s in t)) return Ae(...e);
}, "Ie");
globalThis.Object.defineProperty = Ie;
globalThis.AbortController = class extends AbortController {
  constructor() {
    try {
      super();
    } catch (t) {
      if (t instanceof Error && t.message.includes("Disallowed operation called within global scope")) return { signal: { aborted: false, reason: null, onabort: /* @__PURE__ */ __name(() => {
      }, "onabort"), throwIfAborted: /* @__PURE__ */ __name(() => {
      }, "throwIfAborted") }, abort() {
      } };
      throw t;
    }
  }
};
var Ts = { async fetch(e, t, r) {
  se(), X();
  let s = await __ALSes_PROMISE__;
  if (!s) {
    let n = new URL(e.url), i = await t.ASSETS.fetch(`${n.protocol}//${n.host}/cdn-cgi/errors/no-nodejs_compat.html`), c = i.ok ? i.body : "Error: Could not access built-in Node.js modules. Please make sure that your Cloudflare Pages project has the 'nodejs_compat' compatibility flag set.";
    return new Response(c, { status: 503 });
  }
  let { envAsyncLocalStorage: a, requestContextAsyncLocalStorage: o } = s;
  return a.run({ ...t, NODE_ENV: "production", SUSPENSE_CACHE_URL: v }, async () => o.run({ env: t, ctx: r, cf: e.cf }, async () => {
    if (new URL(e.url).pathname.startsWith("/_next/image")) return z(e, { buildOutput: _, assetsFetcher: t.ASSETS, imagesConfig: f.images });
    let i = G(e);
    return ee({ request: i, ctx: r, assetsFetcher: t.ASSETS }, f, _, m);
  }));
} };
export {
  Ts as default
};
/*!
 * cookie
 * Copyright(c) 2012-2014 Roman Shtylman
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
//# sourceMappingURL=bundledWorker-0.21401339946680664.mjs.map
