const
  MODULE_NAME = "server:middleware:ui5-middleware-destination",
  finalhandler = require("finalhandler"),
  httpProxy = require("http-proxy"),
  serveStatic = require("serve-static"),
  ui5logger = require("@ui5/logger"),

  ProxyEnabler = require("./ProxyEnabler");

function createMiddleware({ resources, options }) {
  const
    { all } = resources,
    proxyEnabler = new ProxyEnabler({
      all,
      ...options.configuration
    }), {
      isDebugMode,
      lockAuthentication,
      unlockAuthentication
    } = proxyEnabler,
    logger = ui5logger.getLogger(MODULE_NAME),
    proxyServer = new httpProxy.createProxyServer();
  
  let serve;
  
  proxyEnabler.initDestinations()
  .then(({ ui5ResourcePath }) => {
    serve = proxyEnabler.preferLocal && ui5ResourcePath && serveStatic(ui5ResourcePath, {
      index: false
    });
  });
  proxyEnabler.initRoutes();

  proxyServer.on("proxyRes", proxyEnabler.lockAuthentication);

  return async function proxyDestination(req, res, next) {
    let resolvedResource;
    try {
      // Add generic headers to the response
      Object.entries(proxyEnabler.resHeaders).forEach((entry) => {
        res.append(...entry);
      });

      // Intercept OPTIONS Method, Doesn't need to proxy
      if (req.method === "OPTIONS") {
        res.status(200);
        next();
        return;
      }

      resolvedResource = await proxyEnabler.resolveResource(req);
      if (!resolvedResource.resolved) { // If middleware doesn't know how to handle this URL, it moves to next
        if (isDebugMode) {
          logger.info(`Skipping to next available middleware! Not sure how to handle ${req.url}`);
        }
        next();
        return;
      }
      req.url = resolvedResource.url;
      if (resolvedResource.serveFromLocal) {
        if (isDebugMode) {
          logger.info(`Serving ${req.url} from ${resolvedResource.target}`);
        }
        serve(req, res, finalhandler(req, res));
      } else if (resolvedResource.serveFromProxy) {
        const config = proxyEnabler.getProxyConfig(resolvedResource);
        req.destinationName = resolvedResource.name;
        if (isDebugMode) {
          logger.info(`Serving ${req.url} from ${config.target}`);
        }
        proxyServer.web(req, res, config, (err) => {
          if (err) {
            proxyEnabler.unlockAuthentication(resolvedResource.name); // Remove authentication information from destination object and skip to next middleware
            next(err);
          }
        })
      }

    } catch (err) {
      next(err);
    }

  };
}

module.exports = createMiddleware;