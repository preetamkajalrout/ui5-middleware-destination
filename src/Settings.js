const
  fs = require("fs"),
  path = require("path"),
  readProperties = require("properties-reader"),
  url = require("url"),

  CSRFTokenActions = Object.freeze({
    FETCH: "Fetch",
    REQUIRED: "Required"
  }),
  NonModifyingMethods = Object.freeze({
    GET: "GET",
    HEAD: "HEAD",
    OPTIONS: "OPTIONS"
  }),
  RouteTypes = Object.freeze({
    DESTINATION: "destination",
    SERVICE: "service"
  });

function getNeoAppRoute(routes, resourcePath) {
  const
    initialRoute = { path: "" },
    route = routes.
      filter(({ path: routePath }) => resourcePath.includes(routePath)).
      reduce((current, next) => (
        next.path.length > current.path.length ? next : current
      ), initialRoute),
    { path: routePath = "", target = {} } = route,
    { entryPath, name, type, version = "" } = target,
    pattern = new RegExp(`${routePath}(/.*)`),
    matches = resourcePath.match(pattern),
    targetEntryPath = entryPath || "",
    targetName = matches[1] || "",
    resolvedUrl = path.posix.join(version, targetEntryPath, targetName);

  return {
    name,
    resolvedUrl,
    type
  };
}

async function readDestinations(configPath) {
  const
    envPath = process.env.UI5_MIDDLEWARE_DESTINATIONS_PATH,
    providedPath = configPath || envPath || "",
    // 'ui5 serve' only runs on projects' root folder
    resolvedPath = path.resolve(process.cwd(), providedPath),
    files = await fs.promises.readdir(resolvedPath),
    destinations = files.map((file) => {
      const
        filePath = path.resolve(resolvedPath, file),
        properties = readProperties(filePath).path(),
        { Name, Password, URL, User, WebIDEUsage = "" } = properties,
        buffer = User && Buffer.from(`${User}:${Password}`),
        Authorization = buffer && `Basic ${buffer.toString("base64")}`,
        CSRFToken = WebIDEUsage.includes("odata") && CSRFTokenActions.FETCH;
      return {
        Authorization,
        CSRFToken,
        Cookie: "",
        Name,
        URL,
        locked: false
      };
    });

  return destinations;
}

async function readNeoAppRoutes() {
  // 'ui5 serve' only runs on projects' root folder
  const filePath = path.resolve(process.cwd(), "neo-app.json");

  try {
    const
      fileContents = await fs.promises.readFile(filePath, "utf8"),
      { routes = [] } = JSON.parse(fileContents);
    return routes;
  } catch (error) {
    throw new Error(`Error while parsing neo-app.json: ${error.message}`);
  }
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
      { customPath, preferLocal = true } = resources,
      envPath = process.env.UI5_MIDDLEWARE_RESOURCES_PATH;

    this.EXTRA_HEADERS = Object.freeze({
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
        "PUT",
        "POST"
      ].join(", ")
    });

    this.debugMode = debugMode;
    this.customPath = customPath || envPath || "";
    // eslint-disable-next-line no-sync
    this.customPathIsLocal = fs.existsSync(this.customPath);
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
    this.getResolvedResource = this.getResolvedResource.bind(this);
    this.setXCSRFToken = this.setXCSRFToken.bind(this);
    this.unlockDestination = this.unlockDestination.bind(this);
  }

  getProxyConfig(resolvedResource, method) {
    const
      { destinations, strictSSL } = this,
      { name, target, type } = resolvedResource,
      headers = {};

    if (type === RouteTypes.DESTINATION) {
      const
        { FETCH } = CSRFTokenActions,
        destination = destinations.find(({ Name }) => Name === name),
        { Authorization, Cookie, CSRFToken } = destination;
      if (Authorization) {
        headers.Authorization = Authorization;
      }
      if (Cookie) {
        headers.Cookie = Cookie;
      }
      if (CSRFToken === FETCH || !NonModifyingMethods[method]) {
        headers["X-CSRF-Token"] = CSRFToken;
      }
    }

    return {
      changeOrigin: Boolean(target),
      followRedirects: true,
      headers,
      secure: strictSSL,
      target,
      ws: true
    };
  }

  async getResolvedResource(sourceUrl) {
    const
      {
        customPath,
        customPathIsLocal,
        destinations,
        preferLocal,
        projectResources,
        routes
      } = this,
      { name, resolvedUrl, type } = getNeoAppRoute(routes, sourceUrl),
      { resolve } = customPathIsLocal ? path : url,
      customFilePath = customPath && resolve(customPath, resolvedUrl),
      // eslint-disable-next-line no-sync
      customFileExists = fs.existsSync(customFilePath),
      resource = await projectResources.byPath(resolvedUrl, { nodir: false }),
      destination = destinations.find(({ Name }) => Name === name),
      { DESTINATION, SERVICE } = RouteTypes,
      isFromDestination = Boolean(type === DESTINATION && destination),
      resolvedResource = {
        name,
        serveFromLocal: false,
        serveWithProxy: false,
        target: "",
        type,
        url: resolvedUrl
      };

    if (isFromDestination) {
      resolvedResource.target = destination.URL.replace(/\\/g, "");
    } else if (type === SERVICE && name === "sapui5") {
      resolvedResource.target = customPath;
    }

    resolvedResource.serveFromLocal =
      preferLocal && customPathIsLocal && customFileExists;

    resolvedResource.serveWithProxy =
      isFromDestination || (!preferLocal && !customPathIsLocal && !resource);

    return resolvedResource;
  }

  setXCSRFToken(proxyRes, req) {
    const
      { headers: { "x-csrf-token": token, "set-cookie": cookies } } = proxyRes,
      { destination: name } = req,
      destination = this.destinations.find(({ locked, Name }) => (
        Name === name && !locked
      ));

    if (!destination) {
      return;
    }

    destination.locked = true;

    if (Array.isArray(cookies)) {
      destination.Cookie = cookies.join("; ");
    }
    if (token && token !== CSRFTokenActions.REQUIRED) {
      destination.CSRFToken = token;
    }
  }

  unlockDestination(name) {
    const destination = this.destinations.find(({ locked, Name }) => (
      Name === name && locked
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