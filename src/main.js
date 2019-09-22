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
  let destinations;
  let routes;
  let routesConfig;
  const httpProxy = require("http-proxy");
  const proxy = new httpProxy.createProxyServer();

  return function (req, res, next) {
      console.log(`[PROXY_SRV] ${req.url}`);
      let config = options.configuration;
      let sMatchedRoute = "";
      let oMatchedRoute = {};

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

      destinations = require(config.destination_path)["destinations"];
      routes = require(resources.rootProject._readers[0]._project.path + "/neo-app.json")["routes"];
      routesConfig  = {};
      // Build a object map for each route
      routes.forEach(function(route) {
        routesConfig[route.path] = route;
      });

      // Find the longest matched route
      for (let route in routesConfig) {
        if (req.url.includes(route)) {
          sMatchedRoute = sMatchedRoute ? (sMatchedRoute.length < route ? route : sMatchedRoute) : route;
        }
      }

      if (!sMatchedRoute) {  // If no route found
        next();
        return;
      }
      console.log("Redirecting: " + destinations[routesConfig[sMatchedRoute].target.name].URL + req.url);
      // If route match found, build the final proxy object to pass around to proxy server
      oMatchedRoute.target = destinations[routesConfig[sMatchedRoute].target.name].URL + req.url;
      if (destinations[routesConfig[sMatchedRoute].target.name].User) {
        oMatchedRoute.auth = destinations[routesConfig[sMatchedRoute].target.name].User + ":" + destinations[routesConfig[sMatchedRoute].target.name].Password;
      }
      proxy.web(req, res, oMatchedRoute, (err) => {
        if (err) {
          next(err);
        }
      });
  }
};