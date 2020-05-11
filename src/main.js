const log = require("@ui5/logger").getLogger("server:middleware:ui5-middlware-destination");
const serveStatic = require("serve-static");
const finalhandler = require("finalhandler");
const httpProxy = require("http-proxy");
const proxyServer = new httpProxy.createProxyServer();

// Global response header constants
const HEADER_ALLOW_CONTROL_ALLOW_ORIGIN = "Access-Control-Allow-Origin";
const HEADER_ALLOW_CONTROL_ALLOW_CREDENTIALS = "Access-Control-Allow-Credentials";
const HEADER_ALLOW_CONTROL_ALLOW_METHODS = "Access-Control-Allow-Methods";
const HEADER_ALLOW_CONTROL_ALLOW_HEADERS = "Access-Control-Allow-Headers";

// Variables for each app
var isDebugMode, // If debug property set for middleware call
    serve, // Static serve utility for SAPUI5 resources
    isLocalResources = false, // Stores the config if resources to be served from local file system instead of normal proxy server
    destinations, // List of destinations mentioned in local destinations file (to be extracted from middleware config)
    routes, // Routes mentioned in neo-app.json
    routesConfig = {}; // Route config for each type of route

function addHeader(res, header, value) {
	const current = res.get(header);
	if ( current == null ) {
		res.set(header, value);
	} else if ( Array.isArray(current) ) {
		res.set(header, [...current, value]);
	} else {
		res.set(header, [current, value]);
	}
}

function initProxyDestination () {
  buildRouteConfigMap();
  if (destinations["sapui5"]) { // If resources can be served as per local destination config
    if (destinations["sapui5"].localDir) {
      isLocalResources = true;
      serve = serveStatic(destinations["sapui5"].path, {
        "index": false
      });
    }
  }
}

function buildRouteConfigMap () {
  routes.forEach(function (route) {
    this[route.path] = route;
  }, routesConfig);
}

function findRoute (routeToMatch) {
  let matchedRoute = "";

  // Find the longest matched route
  for (let route in routesConfig) {
    if (routeToMatch.includes(route)) {
      matchedRoute = matchedRoute ? (matchedRoute.length < route.length ? route : matchedRoute) : route;
    }
  }

  return matchedRoute;
}

function buildProxyObject (reqUrl, matchedRoute) {
  let routeProxyObj = {
    resourcePath: "",
    proxyConfig: {}
  },
  resourceRoute = routesConfig[matchedRoute].target,
  routeDestination = destinations[resourceRoute.name],
  rResourcePattern = new RegExp(`${matchedRoute}(/.*)$`),
  resourcePath = rResourcePattern.exec(reqUrl)[1]; // Assumes there is some path after provided route url

  // Serve SAPUI5 resources from destinations configuration
  if (resourceRoute.type && resourceRoute.type === "service" && resourceRoute.name === "sapui5") {
    routeProxyObj.resourcePath = resourceRoute.version ? `/${resourceRoute.version}` : "";
    routeProxyObj.proxyConfig.target = routeDestination.cdn;
    routeProxyObj.proxyConfig.changeOrigin = true;
  } else {
    routeProxyObj.resourcePath = "";
    routeProxyObj.proxyConfig.target = routeDestination.URL;
  }

  routeProxyObj.resourcePath += (resourceRoute.entryPath || matchedRoute) + resourcePath;

  if (isDebugMode) {
    log.info(`Serving ${routeProxyObj.resourcePath} from ${routeProxyObj.proxyConfig.target}`);
  }

  // Add authorization info for proxy
  if (routeDestination.User) {
    routeProxyObj.proxyConfig.auth = `${routeDestination.User}:${routeDestination.Password}`;
  }

  return routeProxyObj;
}

function _getFormattedUrlForResource (sResourceUrl) {
  var resourceRoute = routesConfig["/resources"].target,
      rResourcePattern = new RegExp(`/resources(/.*)$`);
  
  sResourceUrl = `${resourceRoute.version ? '/' + resourceRoute.version : ''}${resourceRoute.entryPath || "/resources"}${rResourcePattern.exec(sResourceUrl)[1]}`;
  return sResourceUrl;
}

/**
 * Custom UI5 Server middleware example
 *
 * @param {Object} parameters Parameters
 * @param {Object} parameters.resources Resource collections
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.all Reader or Collection to read resources of the
 *                                        root project and its dependencies
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.rootProject Reader or Collection to read resources of
 *                                        the project the server is started in
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.dependencies Reader or Collection to read resources of
 *                                        the projects dependencies
 * @param {Object} parameters.options Options
 * @param {string} [parameters.options.configuration] Custom server middleware configuration if given in ui5.yaml
 * @param {string} [parameters.options.configuration.destination_path] Absolute Path in local system to find the set of destinations file
 * @param {string} [parameters.options.configuration.debug] If set, Logs messages for which calls are being proxied & from where
 * @returns {function} Middleware function to use
 */
function createMiddleware({resources, options}) {
  destinations = require(options.configuration.destination_path)["destinations"];
  routes = require(resources.rootProject._readers[0]._project.path + "/neo-app.json")["routes"];
  isDebugMode = options.configuration.debug || false;

  initProxyDestination(); //Build all the configs for upcoming requests

  return async function proxyDestinations(req, res, next) {
    try {
      let matchedRoute;
      
      // Add headers for fetch
      addHeader(res, HEADER_ALLOW_CONTROL_ALLOW_ORIGIN, "*");
      addHeader(res, HEADER_ALLOW_CONTROL_ALLOW_CREDENTIALS, "true");
      addHeader(res, HEADER_ALLOW_CONTROL_ALLOW_METHODS, "GET,PUT,POST,DELETE");
      addHeader(res, HEADER_ALLOW_CONTROL_ALLOW_HEADERS, "X-Requested-With, Accept, Origin, Referer, User-Agent, Content-Type, Authorization, X-Mindflash-SessionID");
      // Intercept OPTIONS method
      if (req.method === "OPTIONS") {
        // addHeader(res, HEADER_ALLOW_CONTROL_ALLOW_ORIGIN, "*");
        res.status(200);
        next();
        return;
      }

      // Perform route matching to see if neo-app.json contains any entry matching the URL
      matchedRoute = findRoute(req.url);

      if (!matchedRoute || matchedRoute === "/") {
        next();
        return;
      }

      if (matchedRoute.startsWith("/resources") && isLocalResources) {
        req.url = _getFormattedUrlForResource(req.url);
        if (isDebugMode) {
          log.info(`Serving ${req.url} from ${destinations["sapui5"].path}`)
        }
        serve(req, res, finalhandler(req, res));
      } else {
        routeProxy = buildProxyObject(req.url, matchedRoute);
        req.url = routeProxy.resourcePath;
  
        proxyServer.web(req, res, routeProxy.proxyConfig, (err) => {
          if (err) {
            next(err);
          }
        });
      }
    } catch (err) {
      next(err);
    }
  };

}

module.exports = createMiddleware;