# ui5-middleware-destination
Custom UI5 server middleware for projects using [UI5 Tooling](https://sap.github.io/ui5-tooling)
* Provides proxy capabilities and support for `neo-app.json` routes
* Works with destinations from destination files, as WebIDE does
* Supports serving resources from local system or remote CDN (like the [SAPUI5 SDK](https://sapui5.hana.ondemand.com) or an ABAP application server)

## Installation
```bash
npm i --save-dev ui5-middleware-destination
```

## Pre-requisites
Create a directory to hold the destination files needed for your project -- preferably, out of your project's root so that the same config can be used for multiple projects. This also helps keeping your credentials from being committed.

This middleware will look in that directory for one (or many) json file(s) with a specific structure (check the [example json](templates/destinations.json)).

For the time being, the only properties required in a destination configuration are **`Name`, `URL`, `User`, `Password` and `WebIDEUsage`**.

*NOTE: Storing passwords in plain text format ***is a potential security risk***. Please comply with your organization's policy.*


## Options for SAPUI5 config in destinations file
```jsonc
{
  "Name": "sapui5", // Name is used as an identifier
  "Description": "SAPUI5 Resources",
  "URL": "C:\\Dev\\workspace\\sapui5\\sdk", // Can be used to specify cdn URL e.g. https://sapui5.hana.ondemand.com/
  "preferLocal": false // Flag to determine whether the resources files will be served from local system or cdn remote server
}
```

## Usage
### 1. Define the dependency in `$yourapp/package.json`

```jsonc
"devDependencies": {
    // ...
    "ui5-middleware-destination": "*"
    // ...
},
"ui5": {
  "dependencies": [
    // ...
    "ui5-middleware-destination",
    // ...
  ]
}
```

> As the devDependencies are not recognized by the UI5 tooling, they need to be listed in the `ui5.dependencies` array. In addition, once using the `ui5.dependencies` array you need to list all UI5 tooling relevant dependencies.

### 2. Configure it in `$yourapp/ui5.yaml`

#### Simplest usage:
```yaml
server:
  customMiddleware:
    - name: ui5-middleware-destination
      afterMiddleware: cors
      configuration:
  	    destinationsPath: '../path/to/destination/files'
```

#### Example config serving from CDN:
```yaml
server:
  customMiddleware:
    - name: ui5-middleware-destination
      afterMiddleware: cors
      configuration:
        debug: true
        destinationsPath: '../path/to/destination/files'
        resources:
          preferLocal: false
          path: 'https://path/to/CDN/resources'
```

#### Example config serving from an ABAP AS with self-signed certificate:
```yaml
server:
  customMiddleware:
    - name: ui5-middleware-destination
      afterMiddleware: cors
      configuration:
        debug: true
        destinationsPath: '../path/to/destination/files'
        resources:
          preferLocal: false
          path: 'https://<host>:<port>/path/to/ABAP/AS/resources'
        strictSSL: false
```

#### Example config serving from local resources:
```yaml
server:
  customMiddleware:
    - name: ui5-middleware-destination
      afterMiddleware: cors
      configuration:
        destinationsPath: '../path/to/destination/files'
        resources:
          preferLocal: true
          path: '../local/path/to/resources'
```

## Configuration options
**ATTENTION:** No options are mandatory, EXCEPT for **`destinationsPath`**. This option **must** be provided either in the `ui5.yml` file or as an environment variable (as in the description below).

> Note that relative paths declared in these options are resolved against the project's root.

* **`debug`** *(boolean, default:* `false`*)*  
Enables the logging of each request and where it is served from.

* **`destinationsPath`** *(string)*  
Absolute or relative path to the [destination files](#pre-requisites).  
If a relative path is provided, it is resolved against the project's root folder.  
If you do not provide this option in the `ui5.yml` file, you **must** set the `UI5_MIDDLEWARE_DESTINATIONS_PATH` environment variable. 

* **`strictSSL`** *(boolean, default:* `true`*)*  
When set to false, the proxy does not validate SSL certificates of the resource server.  
This covers the use case of, for example, serving routes from a corporate ABAP AS with a self-signed certificate.

* **`resources`** *(object)*  
Options regarding SAPUI5 resources:

  * **`path`** *(string)*  
  If `preferLocal` is `true`, then this is the local absolute or relative path to SAPUI5 resources.  
  When `preferLocal` is `false`, you can provide a CDN URL for the SAPUI5 resources. or [https://sapui5.hana.ondemand.com](https://sapui5.hana.ondemand.com) will be used as CDN source  
  This option can be provided either in the `ui5.yml` file or through the `UI5_MIDDLEWARE_RESOURCES_PATH` environment variable.
  
  * **`preferLocal`** *(boolean, default:* `false`*)*  
  When `true`, middleware redirects all the ui5 resources requests to local filesystem.
  This option can be provided through `UI5_MIDDLEWARE_RESOURCES_LOCAL` environment variable. Possible values in environment variable can be `0` or `1`.

## How it works
* Integrates [node-http-proxy](https://github.com/http-party/node-http-proxy) to proxy requests to remote server using the [destination files](#pre-requisites).
* Integrates [serve-static](https://github.com/expressjs/serve-static) to serve static resources from a local path.

## Limitations
Currently only BasicAuthentication is supported.

## TODO

- [x] Add as a npm module to npm registry
- [ ] Support WebIDE destination files
- [x] Support entryPath
- [x] Support relative path settings
- [ ] Use of environment variables for credentials
- [x] Documentation on how to use the module

## Contribution Guidelines
Pull Request are welcome to add more features. However, if change is complex or huge, Please create an issue and have a discussion on the approach.

## Contributors
- [Preetam](https://github.com/preetamkajalrout)
- [Leonardo](https://github.com/leo-ls)

## LICENSE
Project is distributed under [MIT License](LICENSE)