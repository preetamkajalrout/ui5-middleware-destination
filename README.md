# ui5-middleware-destination
Custom UI5 server middleware for projects using [UI5 Tooling](https://sap.github.io/ui5-tooling)
* Provides proxy capabilities and support for `neo-app.json` routes
* Loads destinations from destination files, as WebIDE does
* Supports serving resources from local system or remote CDN (like the [SAPUI5 SDK](https://sapui5.hana.ondemand.com) or an ABAP application server)

## Installation
```bash
npm i --save-dev ui5-middleware-destination
```

## Pre-requisites
Create a directory to hold the destination files needed for your project -- preferably, out of your project directory so that the same config can be used for multiple projects. This also helps keeping your credentials from being committed.

Add the destination files for each system to the created directory. The destination file structure is the same as the one used for [WebIDE destinations](https://help.sap.com/viewer/825270ffffe74d9f988a0f0066ad59f0/CF/en-US/2cf47f37e34c428c97a51057733c0394.html) (also check the [example template](templates/example)).

For the time being, the only properties required in a destination file are **`Name`, `URL`, `User`, `Password` and `WebIDEUsage`**.

*NOTE: Storing passwords in plain text format ***is a potential security risk***. Please comply with your organization's policy.*

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

#### Simplest example:
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
        debugMode: true
        destinationsPath: '../path/to/destination/files'
        resources:
          preferLocal: false
          customPath: 'https://path/to/CDN/resources'
```

#### Example config serving from an ABAP AS with self-signed certificate:
```yaml
server:
  customMiddleware:
    - name: ui5-middleware-destination
      afterMiddleware: cors
      configuration:
        debugMode: true
        destinationsPath: '../path/to/destination/files'
        resources:
          preferLocal: false
          customPath: 'https://<host>:<port>/path/to/ABAP/AS/resources'
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
          customPath: '../local/path/to/resources'
```

## Configuration options
No options are mandatory, EXCEPT for **`destinationsPath`**. This option must be provided either in the yaml file or as an environment variable.

> Note that relative paths declared in these options are resolved against the project's root folder.

* **`debugMode`** *(boolean, default:* `false`*)*  
Enables the logging of each request and where it is served from.

* **`destinationsPath`** *(string)*  
Absolute or relative path to the [destination files](#pre-requisites).  
If a relative path is provided, it is resolved against the project's root folder.  
If you do not provide this option in the yaml file, you **must** set the `UI5_MIDDLEWARE_DESTINATIONS_PATH` environment variable. 

* **`strictSSL`** *(boolean, default:* `true`*)*  
When set to false, the proxy does not validate SSL certificates of the resource server.  
This covers the use case of, for example, serving routes from a corporate ABAP AS with a self-signed certificate.

* **`resources`** *(object)*  
Options regarding SAPUI5 resources:

  * **`preferLocal`** *(boolean, default:* `true`*)*  
  When `true`, the proxy serves resources first from a local directory; when `false`, resources are served from a CDN.

  * **`customPath`** *(string)*  
  If `preferLocal` is `true`, then this is the local absolute or relative path to SAPUI5 resources.  
  When `preferLocal` is `false`, you must provide a CDN URL for the SAPUI5 resources.  
  This option can be provided either in the yaml file or through the `UI5_MIDDLEWARE_RESOURCES_PATH` environment variable.

## How it works
* Integrates [node-http-proxy](https://github.com/http-party/node-http-proxy) to proxy requests to remote server using the [destination files](#pre-requisites).
* Integrates [serve-static](https://github.com/expressjs/serve-static) to serve static resources from a local path.

## Limitations
Currently only BasicAuthentication is supported.

## TODO

- [x] Add as a npm module to npm registry
- [x] Support WebIDE destination files
- [x] Support entryPath
- [x] Support relative path settings
- [x] Use of environment variables
- [ ] Possible use of flp sandbox
- [x] Documentation on how to use the module

## LICENSE
Project is distributed under [MIT License](LICENSE)