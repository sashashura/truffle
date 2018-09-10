var command = {
  command: 'install',
  description: 'Install a package from the Ethereum Package Registry',
  builder: {},
  userHelp: {
    usage: "truffle install [package_name]<@version>",
    parameters: [
      {
        parameter: "package_name",
        description: "Name of the package as listed in the Ethereum Package Registry.",
      },{
        parameter: "<@version>",
        description: "When specified, will install a specific version of the package, otherwise will install the latest version. (optional)",
      },
    ]
  },
  run: function (options, done) {
    var Config = require("truffle-config");
    var Package = require("../package");

    if (options._ && options._.length > 0) {
      options.packages = options._;
    }

    var config = Config.detect(options);
    Package.install(config, done);
  }
}

module.exports = command;
