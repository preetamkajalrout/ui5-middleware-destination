# ui5-middleware-destination
Custom Server middleware to provide proxy capabilities and support neo-app.json

At the moment, middleware supports serving resources from local system and remote cdn server like sapui5.hana.ondemand.com

## Installation
```bash
npm i --save-dev ui5-middleware-destination
```

## Pre-requisites
Create a **json** file anywhere in your system. Preferably, out of project directory so that same config can be used for multiple projects. This helps you keep your password seperate from any project/repo.

Add the destinations information for each system (same as SCP destinations) in json format. Check the [sample](/templates/destinations.json)!

For the time being, only URL, User & Password fields are supported. Anything else, is just for reference.

*NOTE: Storing passwords in plain text format is still a potential security risk. Please comply with your organization's policy. I am working on a possible alternative to use environment variables to avoid this. But not sure on timelines.*

## Options for SAPUI5 config in destinations file
```json
"sapui5": {
  "Description": "SAPUI5 Resources",
  "cdn": "https://sapui5.hana.ondemand.com", // Used when 'localDir' is set to false
  "path": "C:\\Dev\\workspace\\sapui5\\sdk", // Used when 'localDir' is set to true (uses serve-static internally)
  "localDir": false // Flag to determine whether the resources files will be served from local system or cdn remote server
}
```

## Configuration options (in $yourapp/ui5.yml)
* **destination_path**: Absolute path for destinations store file (Description [above](#Pre-requisites))
* **debug**: (Possible Values: true/false, default: false) : Enables the logging of each request & where it is served from

## Usage
1. Define the dependency in `$yourapp/package.json`:

```json
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

> As the devDependencies are not recognized by the UI5 tooling, they need to be listed in the `ui5 > dependencies` array. In addition, once using the `ui5 > dependencies` array you need to list all UI5 tooling relevant dependencies.

2. configure it in `$yourapp/ui5.yaml`:  

```yaml
server:
  customMiddleware:
    - name: ui5-middleware-destination
      afterMiddleware: cors
      configuration:
        destination_path: C:/Dev/workspace/destinations.json
        debug: true
```
## How it works
* Integrates [node-http-proxy](https://github.com/http-party/node-http-proxy) to proxy requests to remote server as described in [destinations file](#Pre-requisites).
* Integrates [serve-static](https://github.com/expressjs/serve-static) to serve static resources from a specified `destination_path`.

## Limitations
Currently, this supports only Basic authentication for proxy.

## TODO

- [x] Add as a npm module to npm registry
- [x] Support entryPath
- [ ] Support relative path settings
- [ ] Use of environment variables instead
- [ ] Possible use of flp sandbox
- [x] Documentation on how to use the module

## LICENSE
Project is distributed under [MIT License](https://raw.githubusercontent.com/preetamkajalrout/ui5-middleware-destination/master/LICENSE)