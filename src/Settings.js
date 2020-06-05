const
  { existsSync, promises: fsPromises } = require("fs"),
  path = require("path"),
  readProperties = require("properties-reader"),
  URL = require("url"),

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
      "X-Mindflash-SessionID",
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

async function isResourceLocal(resolvedUrl) {
  const
    { customPath, customPathIsLocal, projectResources } = this,
    resource = await projectResources.byPath(resolvedUrl, { nodir: false }),
    { resolve } = customPathIsLocal ? path : URL,
    customFilePath = customPath && resolve(customPath, resolvedUrl),
    isLocal = existsSync(customFilePath) || resource;

  return isLocal;
}

async function buildFileOptions(route) {
  const
    { name, resolvedUrl, type } = route,
    { customPath, customPathIsLocal, preferLocal } = this,
    resourceIsLocal = await isResourceLocal.call(this, resolvedUrl),
    serveFromLocal = preferLocal && customPathIsLocal && resourceIsLocal,
    target = (type === "service" && name === "sapui5") ? customPath : "";

  return {
    serveFromLocal,
    target
  };
}

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
    headers = Object.fromEntries(entries);

  return headers;
}

async function buildProxyOptions(route) {
  const
    { name, resolvedUrl, type } = route,
    { destinations, preferLocal } = this,
    { url = "" } = destinations.find(({ Name }) => Name === name) || {},
    target = url.replace(/\\/g, ""),
    isFromDestination = Boolean(type === "destination" && target),
    resourceIsLocal = await isResourceLocal.call(this, resolvedUrl),
    serveWithProxy = isFromDestination || (!preferLocal && !resourceIsLocal);

  return {
    serveWithProxy,
    target
  };
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
    pattern = new RegExp(`${routePath}(/.*)`),
    resolvedName = pattern.test(url) ? url.match(pattern)[1] : url,
    resolvedUrl = path.posix.join(version, entryPath, resolvedName);

  return {
    name,
    resolvedUrl,
    type
  };
}

function toDestinations(properties) {
  const
    { Name, Password, URL: url, User, WebIDEUsage = "" } = properties,
    buffer = User && Buffer.from(`${User}:${Password}`),
    Authorization = buffer && `Basic ${buffer.toString("base64")}`,
    CSRFToken = WebIDEUsage.includes("odata") && CSRFTokenActions.FETCH;

  return {
    Authorization,
    CSRFToken,
    Cookie: "",
    Name,
    locked: false,
    url
  };
}

function toProperties(properties, file) {
  const
    { ext } = path.parse(file),
    { destinations } = (ext === ".json") && require(file),
    webideDestination = (ext === "") && readProperties(file).path(),
    allProperties = properties.concat(destinations, webideDestination),
    filteredProperties = allProperties.filter(Boolean);

  return filteredProperties;
}

async function readDestinations(configPath) {
  const
    envPath = process.env.UI5_MIDDLEWARE_DESTINATIONS_PATH || "",
    providedPath = configPath || envPath,
    resolvedPath = path.resolve(process.cwd(), providedPath),
    files = await fsPromises.readdir(resolvedPath),
    resolvedFiles = files.map((file) => path.resolve(resolvedPath, file)),
    properties = resolvedFiles.reduce(toProperties, []),
    destinations = properties.map(toDestinations);

  return destinations;
}

async function readNeoAppRoutes() {
  const
    filePath = path.resolve(process.cwd(), "neo-app.json"),
    fileContents = await fsPromises.readFile(filePath, "utf8"),
    { routes = [] } = JSON.parse(fileContents);

  return routes;
}

class Settings {

  constructor(parameters) {
    const
      {
        all,
        debugMode = false,
        destinationsPath,
        resources = {},
        strictSSL = true
      } = parameters,
      { customPath = "", preferLocal = true } = resources,
      envPath = process.env.UI5_MIDDLEWARE_RESOURCES_PATH || "";

    this.customPath = customPath || envPath;
    this.customPathIsLocal = existsSync(this.customPath);
    this.debugMode = debugMode;
    this.EXTRA_HEADERS = EXTRA_HEADERS;
    this.preferLocal = preferLocal;
    this.projectResources = all;
    this.strictSSL = strictSSL;

    readDestinations(destinationsPath).then((destinations) => {
      this.destinations = destinations;
    });
    readNeoAppRoutes().then((routes) => {
      this.routes = routes;
    });

    this.getProxyConfig = this.getProxyConfig.bind(this);
    this.lockAuthentication = this.lockAuthentication.bind(this);
    this.resolveResource = this.resolveResource.bind(this);
    this.unlockAuthentication = this.unlockAuthentication.bind(this);
  }

  getProxyConfig(resolvedResource) {
    const
      { method, name, target } = resolvedResource,
      { destinations, strictSSL } = this,
      destination = destinations.find(({ Name }) => Name === name) || {},
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
      destination = this.destinations.find(({ locked, Name }) => (
        Name === destinationName && !locked
      ));

    if (!destination) {
      return;
    }

    destination.locked = true;
    destination.Cookie = Array.isArray(cookies) ? cookies.join("; ") : "";
    destination.CSRFToken = token !== CSRFTokenActions.REQUIRED && token;
  }

  async resolveResource({ url, method }) {
    const
      route = findNeoAppRoute.call(this, url),
      { name, resolvedUrl, type } = route,
      {
        serveFromLocal,
        target: localTarget = ""
      } = await buildFileOptions.call(this, route),
      {
        serveWithProxy,
        target: proxyTarget = ""
      } = await buildProxyOptions.call(this, route),
      target = proxyTarget || localTarget;

    return {
      method,
      name,
      serveFromLocal,
      serveWithProxy,
      target,
      type,
      url: resolvedUrl
    };
  }

  unlockAuthentication(destinationName) {
    const destination = this.destinations.find(({ locked, Name }) => (
      Name === destinationName && locked
    ));

    if (!destination) {
      return;
    }

    destination.Cookie = "";
    destination.CSRFToken = CSRFTokenActions.FETCH;
    destination.locked = false;
  }

}

module.exports = Settings;