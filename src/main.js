const
  MODULE_NAME = "server:middleware:ui5-middlware-destination",

  finalhandler = require("finalhandler"),
  httpProxy = require("http-proxy"),
  serveStatic = require("serve-static"),
  ui5logger = require("@ui5/logger"),

  Settings = require("./Settings");

function createMiddleware(parameters) {
  const
    { resources: { all }, options: { configuration } } = parameters,
    settings = new Settings({
      all,
      ...configuration
    }),
    {
      customPath,
      customPathIsLocal,
      debugMode,
      EXTRA_HEADERS,
      getProxyConfig,
      resolveResource,
      lockAuthentication,
      unlockAuthentication
    } = settings,
    logger = ui5logger.getLogger(MODULE_NAME),
    proxyServer = new httpProxy.createProxyServer(),
    serve = customPathIsLocal && customPath && serveStatic(customPath, {
      index: false
    });

  proxyServer.on("proxyRes", lockAuthentication);

  return function (req, res, next) {
    Object.entries(EXTRA_HEADERS).forEach((entry) => {
      res.append(...entry);
    });

    if (req.method === "OPTIONS") {
      res.status(200);
      next();
      return;
    }

    resolveResource(req).then((resolvedResource) => {
      const {
        name,
        serveFromLocal,
        serveWithProxy,
        target,
        url
      } = resolvedResource;

      req.url = url;

      if (serveFromLocal) {

        if (debugMode) {
          logger.info(`Serving ${req.url} from ${target}`);
        }

        serve(req, res, finalhandler(req, res));

      } else if (serveWithProxy) {

        const config = getProxyConfig(resolvedResource);

        req.destinationName = name;

        if (debugMode) {
          logger.info(`Serving ${req.url} from ${config.target}`);
        }

        proxyServer.web(req, res, config, (error) => {
          if (error) {
            unlockAuthentication(name);
            next(error);
          }
        });

      }

      return !serveFromLocal && !serveWithProxy;
    }).
      then((callNext) => {
        if (callNext) {
          next();
        }
      }).
      catch(next);
  };

}

module.exports = createMiddleware;