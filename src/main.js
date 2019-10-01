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
module.exports = function({resources, options}) {
  const destinations = require(options.configuration.destination_path)["destinations"];
  const routes = require(resources.rootProject._readers[0]._project.path + "/neo-app.json")["routes"];
  const httpProxy = require("http-proxy");
  const proxy = new httpProxy.createProxyServer();

  let routesConfig = {};

  function buildRouteConfig () {
      // Build a object map for each route
      routes.forEach(function(route) {
        routesConfig[route.path] = route;
      });
  }

  function findRoute (routeToMatch) {
    let sMatchedRoute = "";
    // Find the longest matched route
    for (let route in routesConfig) {
      if (routeToMatch.includes(route)) {
        sMatchedRoute = sMatchedRoute ? (sMatchedRoute.length < route.length ? route : sMatchedRoute) : route;
      }
    }
    return sMatchedRoute;
  }

  function buildProxyObject (reqUrl, matchedRoute) {
    let routeProxyObject = {};
    let resourceRoute = routesConfig[matchedRoute].target;
    let oDestination = destinations[resourceRoute.name];
    console.log(`Resource: ${reqUrl}`);
    // If route match found, build the final proxy object to pass around to proxy server

    // Final Target URL for the resource
    let routeRegExp = new RegExp(`${matchedRoute}(/.*)$`);
    let resourcePath = routeRegExp.exec(reqUrl)[1];


    reqUrl = "";
    // Serve SAPUI5 resources from cdn or local server or fs
    if (resourceRoute.type && resourceRoute.type === "service" && resourceRoute.name === "sapui5") {
      reqUrl = resourceRoute.version ? `/${resourceRoute.version}` : "";
      routeProxyObject.target = oDestination.cdn;
    } else {
      debugger;
      routeProxyObject.target = oDestination.URL;
    }
    reqUrl += resourceRoute.entryPath + resourcePath;

    // Add Authorization info for proxy
    if (oDestination.User) {
      routeProxyObject.auth = `${oDestination.User}:${oDestination.Password}`;
    }

    return {
      resourcePath: reqUrl,
      proxyObject: routeProxyObject
    };
  }

  buildRouteConfig();

  return function (req, res, next) {
      console.log(`[PROXY_SRV] ${req.url}`);
      let sMatchedRoute = "";
      let oMatchedRoute = {};
      let oRouteProxy = {};

      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
      res.header('Access-Control-Allow-Headers', 'X-Requested-With, Accept, Origin, Referer, User-Agent, Content-Type, Authorization, X-Mindflash-SessionID');
      // intercept OPTIONS method
      if ('OPTIONS' === req.method) {
        res.header(200);
        console.log(req.method + '(options): ' + req.url);
        next();
        return;
      }

      sMatchedRoute = findRoute(req.url);

      if (!sMatchedRoute || sMatchedRoute === "/") {  // If no route found, "/" is found move to next
        next();
        return;
      }

      oRouteProxy = buildProxyObject(req.url, sMatchedRoute);
      oMatchedRoute = oRouteProxy.proxyObject;
      req.url = oRouteProxy.resourcePath;

      console.log(`Redirected: ${oMatchedRoute.target}, ${req.url}`);
      proxy.web(req, res, oMatchedRoute, (err) => {
        if (err) {
          next(err);
        }
      });
  }
};