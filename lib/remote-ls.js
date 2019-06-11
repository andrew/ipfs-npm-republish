var _ = require('lodash');
var async = require('async');
var semver = require('semver');
var pacote = require('pacote');

// perform a recursive walk of a remote
// npm package and determine its dependency
// tree.
function RemoteLS (opts) {
  var _this = this

  _.extend(this, {
    logger: console,
    development: true, // include dev dependencies.
    optional: true, // include optional dependencies.
    verbose: false,
    queue: async.queue(function (task, done) {
      _this._loadPackageJson(task, done)
    }, 8),
    tree: {},
    flat: {}
  }, {}, opts)

  this.queue.pause()
}

RemoteLS.prototype._loadPackageJson = function (task, done) {
  var _this = this
  var name = task.name

  pacote.packument(name, {cache: require('os').homedir() + '/.npm/_cacache', "prefer-offline": true}).then((obj) => {
    try {
      if (_this.verbose) console.log('loading:', name + '@' + task.version)
      _this._walkDependencies(task, obj, done)
    } catch (e) {
      _this.logger.log(e.message)
      done()
    }
  })
}

RemoteLS.prototype._walkDependencies = function (task, packageJson, done) {
  var _this = this
  var version = this._guessVersion(task.version, packageJson)
  var dependencies = _.extend(
    {},
    packageJson.versions[version].dependencies,
    this.optional ? packageJson.versions[version].optionalDependencies : {},
    // show development dependencies if we're at the root, and deevelopment flag is true.
    (task.parent === this.tree && this.development) ? packageJson.versions[version].devDependencies : {}
  )
  var fullName = packageJson.name + '@' + version
  var parent = task.parent[fullName] = {}

  if (_this.flat[fullName]) return done()
  else _this.flat[fullName] = true

  Object.keys(dependencies).forEach(function (name) {
    _this.queue.push({
      name: name,
      version: dependencies[name],
      parent: parent
    })
  })

  done()
}

RemoteLS.prototype._guessVersion = function (versionString, packageJson) {
  if (versionString === 'latest') versionString = '*'

  var availableVersions = Object.keys(packageJson.versions)
  var version = semver.maxSatisfying(availableVersions, versionString, true)

  // check for prerelease-only versions
  if (!version && versionString === '*' && availableVersions.every(function (av) {
    return new semver.SemVer(av, true).prerelease.length
  })) {
    // just use latest then
    version = packageJson['dist-tags'] && packageJson['dist-tags'].latest
  }

  if (!version) throw Error('could not find a satisfactory version for string ' + versionString)
  else return version
}

RemoteLS.prototype.ls = function (name, version, callback) {
  var _this = this

  this.queue.push({
    name: name,
    version: version,
    parent: this.tree
  })

  this.queue.drain = function () {
    callback(_this.tree)
  }

  this.queue.resume()
}

module.exports = RemoteLS
