const log = require("@ui5/logger").getLogger("server:middleware:ui5-middlware-destination");
const parseurl = require("parseurl");
const querystring = require("querystring");
const httpProxy = require("http-proxy");
const proxyServer = new httpProxy.createProxyServer();

// Global response header constants
const HEADER_ALLOW_CONTROL_ALLOW_ORIGIN = "Access-Control-Allow-Origin";
const HEADER_ALLOW_CONTROL_ALLOW_CREDENTIALS = "Access-Control-Allow-Credentials";
const HEADER_ALLOW_CONTROL_ALLOW_METHODS = "Access-Control-Allow-Methods";
const HEADER_ALLOW_CONTROL_ALLOW_HEADERS = "Access-Control-Allow-Headers";

// Variables for each app
var destinations, routes, routesConfig = {};

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
    routeProxyObj.resourcePath = resourceRoute.version ? `/${resourceRoute.version}` : "",
    routeProxyObj.proxyConfig.target = routeDestination.cdn;
  } else {
    routeProxyObj.resourcePath = "";
    routeProxyObj.proxyConfig.target = routeDestination.URL;
  }

  routeProxyObj.resourcePath += (resourceRoute.entryPath || matchedRoute) + resourcePath;

  // Add authorization info for proxy
  if (routeDestination.User) {
    routeProxyObj.proxyConfig.auth = `${routeDestination.User}:${routeDestination.Password}`;
  }

  return routeProxyObj;
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
 * @returns {function} Middleware function to use
 */
function createMiddleware({resources, options}) {
  destinations = require(options.configuration.destination_path)["destinations"];
  routes = require(resources.rootProject._readers[0]._project.path + "/neo-app.json")["routes"];

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
        res.status(200);
        next();
        return;
      }

      // Perform route matching to see if neo-app.json contains any entry matching the URL
      matchedRoute = findRoute(req.url);

      if (!matchedRoute|| matchedRoute === "/") {
        next();
        return;
      }

      routeProxy = buildProxyObject(req.url, matchedRoute);
      req.url = routeProxy.resourcePath;

      proxyServer.web(req, res, routeProxy.proxyConfig, (err) => {
        if (err) {
          next(err);
        }
      });

    } catch (err) {
      next(err);
    }
  };

}

module.exports = createMiddleware;