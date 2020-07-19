const
  { existsSync, promises: fsPromises } = require("fs"),
  path = require("path"),
  URL = require("url"),


  DESTINATION_TYPE = Object.freeze({
    "SERVICE": "service",
    "DESTINATION": "destination"
  }),
  CSRFTokenActions = Object.freeze({
    FETCH: "Fetch",
    REQUIRED: "Required"
  }),
  EXTRA_HEADERS = Object.freeze({
    "Accept": "*/*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": [
      "Accept",
      "Authorization",
      "Content-Type",
      "Origin",
      "Referer",
      "User-Agent",
      "X-Requested-With"
    ].join(", "),
    "Access-Control-Allow-Methods": [
      "DELETE",
      "GET",
      "HEAD",
      "MERGE",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT"
    ].join(", ")
  });

function buildHeaders(destination, method) {
  const
    { Authorization, Cookie, CSRFToken: token } = destination,
    requiresToken = !["GET", "HEAD", "OPTIONS"].includes(method),
    CSRFToken = (token === CSRFTokenActions.FETCH || requiresToken) && token,
    entries = [
      ["Authorization", Authorization],
      ["Cookie", Cookie],
      ["X-CSRF-Token", CSRFToken]
    ].filter(([, value]) => Boolean(value)),
    headers = entries.reduce((headerAcc, entry) => {
      headerAcc[entry[0]] = entry[1];
      return headerAcc;
    }, {});

  return headers;
}

function resolveDestinations(destination) {
  const
    { Name, User, Password, URL: url, WebIDEUsage = "", preferLocal = false } = destination,
    buffer = User && Buffer.from(`${User}:${Password}`),
    Authorization = buffer && `Basic ${buffer.toString("base64")}`,
    CSRFToken = WebIDEUsage.includes("odata") && CSRFTokenActions.FETCH;

  return {
    Authorization,
    CSRFToken,
    Cookie: "",
    Name,
    locked: false,
    url,
    preferLocal
  };
}

function toDestinations(scpDestinations, file) {
  const
    { ext } = path.parse(file),
    { destinations: jsonDestinations } = (ext === ".json") && require(file),
    allDestinations = scpDestinations.concat(jsonDestinations),
    filteredDestinations = allDestinations.filter(Boolean);

  return filteredDestinations;
}

function toDestinationStore(destinationStore, destination) {
  destinationStore[destination.Name] = destination;
  return destinationStore;
}

async function readDestinations(destinationsPath) {
  const
    envPath = process.env.UI5_MIDDLEWARE_DESTINATIONS_PATH || "",
    providedPath = destinationsPath || envPath,
    resolvedPath = path.resolve(process.cwd(), providedPath),
    files = await fsPromises.readdir(resolvedPath),
    resolvedFiles = files.map((file) => path.resolve(resolvedPath, file)),
    scpDestinations = resolvedFiles.reduce(toDestinations, []),
    destinations = scpDestinations.map(resolveDestinations),
    destinationStore = destinations.reduce(toDestinationStore, {});

  return destinationStore;
}

async function readNeoAppRoutes() {
  const
    filePath = path.resolve(process.cwd(), "neo-app.json"),
    fileContents = await fsPromises.readFile(filePath, "utf8"),
    { routes = [] } = JSON.parse(fileContents);

  return routes;
}

function findNeoAppRoute(url) {
  const
    { routes } = this,
    filteredRoutes = routes.filter((route) => url.includes(route.path)),
    longestRoute = filteredRoutes.reduce((current, next) => (
      next.path.length > current.path.length ? next : current
    ), { path: "" }),
    { path: routePath = "", target = {} } = longestRoute,
    { entryPath = "", name, type, version = "" } = target,
    pattern = new RegExp(`${routePath}(/?.*)`),
    resolvedName = pattern.test(url) ? url.match(pattern)[1] : url,
    resolvedUrl = path.posix.join(version, entryPath, resolvedName);

  return {
    name,
    type,
    resolvedUrl
  }
}

async function buildProxyOptions(route) {
  const
    { name, resolvedUrl, type } = route,
    { destinations, preferLocal } = this,
    { url: target = "" } = destinations[name] || {},
    serveFromLocal = (type === DESTINATION_TYPE.SERVICE && name === "sapui5" && preferLocal),
    serveFromProxy = Boolean(target);

  return {
    serveFromLocal: serveFromLocal || false,
    serveFromProxy: serveFromProxy || false,
    target
  };
}

class ProxyEnabler {
  constructor(parameters) {
    const
      {
        all: projectResources,
        debug: debugMode = false,
        destinationsPath,
        strictSSL = true
      } = parameters;

    this.projectResources = projectResources;
    this.destinationsPath = destinationsPath;
    this.ui5ResourcePath = "";
    this.preferLocal = false;
    this.isDebugMode = debugMode;
    this.resHeaders = EXTRA_HEADERS;
    this.strictSSL = strictSSL;

    this.destinations = {};
    this.routes = [];

    this.initDestinations = this.initDestinations.bind(this);
    this.initRoutes = this.initRoutes.bind(this);
    this.getProxyConfig = this.getProxyConfig.bind(this);
    this.lockAuthentication = this.lockAuthentication.bind(this);
    this.unlockAuthentication = this.unlockAuthentication.bind(this);
    this.resolveResource = this.resolveResource.bind(this);
  }


  async initDestinations() {
    const envPath = process.env.UI5_MIDDLEWARE_RESOURCES_PATH || "";
    this.destinations = await readDestinations(this.destinationsPath);
    if (!this.ui5ResourcePath && this.destinations["sapui5"]) { // Middleware tries to default to cdn if no entry were provided
      this.ui5ResourcePath = this.destinations["sapui5"].url || "https://sapui5.hana.ondemand.com";
      this.preferLocal = this.destinations["sapui5"].preferLocal || false;
    }
    this.ui5ResourcePath = this.ui5ResourcePath || envPath;

    return {
      ui5ResourcePath: this.ui5ResourcePath,
      destinations: this.destinations
    };
  }

  async initRoutes() {
    this.routes = await readNeoAppRoutes();
    return { routes: this.routes };
  }

  getProxyConfig(resolvedResource) {
    const
      { method, name, target } = resolvedResource,
      { destinations, strictSSL } = this,
      destination = destinations[name] || {},
      headers = buildHeaders(destination, method);

    return {
      changeOrigin: Boolean(target),
      followRedirects: true,
      headers,
      secure: strictSSL,
      target,
      ws: true
    };
  }

  lockAuthentication(proxyRes, req) {
    const
      { headers: { "set-cookie": cookies, "x-csrf-token": token } } = proxyRes,
      { destinationName } = req,
      destination = this.destinations[destinationName] && !(this.destinations[destinationName].locked || false) ? this.destinations[destinationName] : null;

    if (!destination) { // If destination is locked or doesn't exist
      return;
    }

    destination.locked = true;
    destination.Cookie = Array.isArray(cookies) ? cookies.join("; ") : "";
    destination.CSRFToken = token !== CSRFTokenActions.REQUIRED && token;
    this.destinations[destinationName] = destination;
  }

  unlockAuthentication(destinationName) {
    const destination = this.destinations[destinationName] && (this.destinations[destinationName].locked || false) ? this.destinations[destinationName] : null;

    if (!destination) { // If desitanation is already unlocked or doesn't exist
      return;
    }

    destination.Cookie = "";
    destination.CSRFToken = CSRFTokenActions.FETCH;
    destination.locked = false;
    this.destinations[destinationName] = destination;
  }

  async resolveResource({ url, method }) {
    const
      route = findNeoAppRoute.call(this, url),
      { name, resolvedUrl, type } = route,
      {
        serveFromLocal,
        serveFromProxy,
        target
      } = await buildProxyOptions.call(this, route),
      resolved = serveFromLocal || serveFromProxy;

    return {
      resolved,
      method,
      name,
      serveFromLocal,
      serveFromProxy,
      target,
      type,
      url: resolvedUrl
    };
  }
}

module.exports = ProxyEnabler;