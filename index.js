  //
 // nexus (remote program installation and control)
//

var fs       = require('fs')
  , path     = require('path')
  , util     = require('util')
  , net      = require('net')
  , spawn    = require('child_process').spawn
  , dnode    = require('dnode')
  , fstream  = require('fstream')
  , AA       = require('async-array')
  , EE2      = require('eventemitter2').EventEmitter2
  , ee       = new EE2({wildcard:true,delimiter:'::',maxListeners: 20})
  , pf       = require('portfinder')
  , rimraf   = require('rimraf') 
  , npm      = require('npm')
  , uuid     = require('node-uuid')
  , _config  = config()
  , _pkg     = require('./package.json')
  , procs    = {}
  , toStop   = []
  , subscriptions = {}
  
ee.onAny(function(){
  var args = [].slice.call(arguments)
  //console.log.apply(this,[].concat(this.event,'→',args))
  if (/^stdout/.test(this.event)) 
    console.log.apply(this,[].concat(this.event,'→',args))
  else if (/^stderr/.test(this.event))
    console.log.apply(this,[].concat(this.event,'→',args))
  else 
    console.log.apply(this,[].concat(this.event))
})
  
//------------------------------------------------------------------------------
//                                               exports
//------------------------------------------------------------------------------

module.exports = exports =
  { version   : _pkg.version
  , config    : config
  , install   : install
  , uninstall : uninstall
  , link      : link
  , ls        : ls
  , ps        : ps
  , start     : start
  , restart   : restart
  , stop      : stop
  , stopall   : stopall
  , subscribe : subscribe
  , remote    : remote
  }
  
//------------------------------------------------------------------------------
//                                               version
//------------------------------------------------------------------------------

function version(cb) {cb(null, _version); return _version}

//------------------------------------------------------------------------------
//                                               config
//------------------------------------------------------------------------------

function config(key, value, cb) {
  
  // #TODO get/set config
  
  if (key && value && !cb) cb = value
  if (key && !value && !cb) cb = key
  var currConfig = {}
    , fileConfig = {}
    , fileConfigPath = process.env.HOME+'/.nexus/config.json'

  try { fileConfig = require(fileConfigPath) }
  catch (e) {} // no config.json, so we use hardcoded defaults

  currConfig.prefix  = fileConfig.prefix  || process.env.HOME+'/.nexus'
  currConfig.key     = fileConfig.key     || currConfig.prefix+'/nexus.key'
  currConfig.cert    = fileConfig.cert    || currConfig.prefix+'/nexus.cert'
  currConfig.tmp     = fileConfig.tmp     || currConfig.prefix+'/tmp'
  currConfig.apps    = fileConfig.apps    || currConfig.prefix+'/apps'
  currConfig.pids    = fileConfig.pids    || currConfig.prefix+'/pids'
  currConfig.keys    = fileConfig.keys    || currConfig.prefix+'/keys'
  currConfig.logs    = fileConfig.logs    || currConfig.prefix+'/logs'
  currConfig.host    = fileConfig.host    || '127.0.0.1'
  currConfig.port    = fileConfig.port    || 5000
  currConfig.remotes = fileConfig.remotes || { localhost : 
                                               { host : currConfig.host
                                               , port : currConfig.port } }

  var aa = new AA
    ( [ currConfig.pids
      , currConfig.keys
      , currConfig.logs
      , currConfig.apps
      , currConfig.tmp
      ] )

  aa.map(function(x, i, next){
    fs.lstat(x, function(err){
      if (!err) return next()
      var w = fstream.Writer({path:x,type:'Directory'})
      // w.on('error',function(err){next(err)})
      w.once('end',function(){next()})
      w.end()
    })
  }).done(function(err, data){
    if (err) return cb && cb(err)
    cb && cb(null, currConfig)
  }).exec()

  return currConfig
}

//------------------------------------------------------------------------------
//                                               install
//------------------------------------------------------------------------------

function install(what, name, cb) {
  if (typeof arguments[arguments.length - 1] === 'function')
    cb = arguments[arguments.length - 1]
  if (arguments[1] && typeof arguments[1] === 'string')
    name = arguments[1]
  else 
    name = null

  npm.load({prefix:_config.tmp, global:true, loglevel:'silent'}, function(err){
    if (err) return cb(err)
    npm.commands.install(what, function(err, res){
      if (err) return cb(err)
      if (!name) name = res[0][0]
      var r = fstream.Reader(res[0][1])
        , w = fstream.Writer( { path:_config.apps+'/'+name
                              , type:'Directory' } )
      r.pipe(w)
      w.once('end',function(){
        // #TODO maybe delete _config.tmp+'/lib'
        // what if 2 guys install at the same time?
        rimraf(res[0][1],function(err){cb(err, res[0][0])})
        cb(null, name)
      })
    })
  })
}

//------------------------------------------------------------------------------
//                                               uninstall
//------------------------------------------------------------------------------

function uninstall(opts, cb) {
  var path = _config.apps+'/'+opts
  fs.stat(path,function(err,stat){
    if (err) return cb(opts+' not installed')
    rimraf(_config.apps+'/'+opts,cb)  
  })
}

//------------------------------------------------------------------------------
//                                               link
//------------------------------------------------------------------------------

function link(opts, cb) {
  cb('#TODO')
  // like `npm link`
  // fstream.Writer({type:'Symlink'}).end()
}

//------------------------------------------------------------------------------
//                                               ls
//------------------------------------------------------------------------------

function ls(what,cb) {
  if (arguments[0] && typeof arguments[0] === 'string')
    what = arguments[0]
  if (typeof arguments[arguments.length - 1] === 'function')
    cb = arguments[arguments.length - 1]
  
  if (what) {
    var pkg = require(_config.apps+'/'+what+'/package.json')
    cb && cb(null,pkg)
    return
  }
  
  fs.readdir(_config.apps,function(err,data){
    if (err) return cb(err)
    var result = {}
    var aa = new AA(data)
    aa.map(function(x,i,next){
      var pkg = require(_config.apps+'/'+x+'/package.json')
      result[x] = pkg
      next()
    }).done(function(){
      cb && cb(null,result)
    }).exec()
  })
}

//------------------------------------------------------------------------------
//                                               ps
//------------------------------------------------------------------------------

function ps(cb) {
  cb(null,procs)
}

//------------------------------------------------------------------------------
//                                               start
//------------------------------------------------------------------------------

function start(opts, cb) {
  parseStart(opts, function(err, data){
    var env = process.env
    if (data.env) {
      for (var x in data.env)
        env[x] = data.env[x]
    }
      
    var child = spawn( data.command
                     , [data.script].concat(data.options)
                     , { env : env
                       , cwd : data.cwd
                       } )
    
    var id = opts.id || uuid()

    if (!procs[id]) { 
      procs[id] = data
      procs[id].id = id
      procs[id].crashed = 0
      procs[id].ctime = Date.now()
      procs[id].env = data.env
    }

    procs[id].pid = child.pid

    ee.emit('started::'+id, procs[id])
    child.stdout.on('data',function(data){
      ee.emit('stdout::'+id, data.toString())
    })
    child.stderr.on('data',function(data){
      ee.emit('stderr::'+id, data.toString())
    })
    child.on('exit',function(code){
      ee.emit('exited::'+id, code)
      if (code != 0) {
        procs[id].crashed++
        var toStopIndex = toStop.indexOf(id)
        if (toStopIndex != -1) {
          toStop.splice(toStopIndex)
          delete procs[id]
        }
        else {
          if (procs[id].crashed <= 10) {
            opts.id = id
            start(opts)
          } else {
            delete procs[id]
          }
        }
      }
    })
    cb && cb(null, procs[id])
  })
}

//------------------------------------------------------------------------------
//                                               restart
//------------------------------------------------------------------------------

function restart(id, cb) {
  var startOpts = {} 
  startOpts.command = running[id].command
  startOpts.script  = running[id].script
  startOpts.options = running[id].options
  startOpts.id      = id
  stop(id, function(err,data){
    start(startOpts, cb)
  })
}

//------------------------------------------------------------------------------
//                                               stop
//------------------------------------------------------------------------------

function stop(id, cb) {
  toStop.push(id)
  process.kill(procs[id].pid)
  cb && cb(null, id)
}

//------------------------------------------------------------------------------
//                                               stopall
//------------------------------------------------------------------------------

function stopall(cb) {
  var len = 0
  for (var proc in procs) {
    len++
    stop(proc)
  }  
  cb(null, len)
}

//------------------------------------------------------------------------------
//                                               subscribe
//------------------------------------------------------------------------------

function subscribe(opts, cb) {

}

function unsubscribe(opts, cb) {

}

//------------------------------------------------------------------------------
//                                               remote
//------------------------------------------------------------------------------

function remote(opts, cb) {

  var opts = opts || {}
    , remote = (opts.remote && config.remotes[opts.remote]) 
               ? config.remotes[opts.remote] : false
    , port = opts.port || (remote && remote.port) ? remote.port : config.defaults.tlsPort                  
    , host = opts.host || (remote && remote.host) ? remote.host : 'localhost'
    , keyFile  = opts.key  || config.defaults.key
    , certFile = opts.cert || config.defaults.cert
    , key = fs.readFileSync(keyFile)
    , cert = fs.readFileSync(certFile)                                            
    , options = {key:key,cert:cert}
  
  console.log('connecting to '+host+':'+port)
  dnode.connect(host, port, options, function(remote,con) { 
    cb(null,remote)
  }).on('error',function(err){cb(err)})
    
  return null

}

//------------------------------------------------------------------------------
//                                               parseStart
//------------------------------------------------------------------------------

function parseStart(opts, cb) {
  var result = {}
  
  console.log('parseStart',opts)
  
  result.script = null
  result.id = opts.id || null
  result.command = opts.command || 'node'
  result.options = opts.options || []
  result.env = opts.env || {}
  result.cwd = opts.cwd || process.cwd()
  
  // nexus start /some/file
  //   script = /some/file 
  // nexus start ./some/file 
  //   script = CWD+'/some/file'
  // nexus start appName/path/to/script
  //   appName is an app
  //     ? script = _config.apps+'/appName/path/to/script'
  //     : script = CWD+'/appName/path/to/script'
  // nexus start appName
  //   appName is an app
  //     ? look for package.json-startScript
  //       ? starScript.split(' ')
  //         ? fs.stat([0])
  //           ? script = [0], options = [>0]
  //           : command = [0], script = [1], options = [>1]
  //         : script = _config.apps+'/appName/'+startScript 
  //       : fs.stat(appName+'/server.js') || fs.stat(appName+'/app.js')
  //         ? script = appName+'/server.js' || appName+'/server.js'
  //         : script = appName // this is most likely an error..
  //     : script CWD+'/'+appName // this is most likely an error..
  
  // handle `nexus start /some/file` and `nexus start ./some/file`
  result.script = 
    /^\//.test(opts.script) 
      ? opts.script 
      : /^\.\//.test(opts.script)
        ? process.cwd()+'/'+opts.script.substring(1)
        : null
  
  // handle `nexus start appName/path/to/script`
  if (!result.script && /\//.test(opts.script)) {
    var maybeApp = opts.script.split('/')[0]
      , isApp = path.existsSync(_config.apps+'/'+maybeApp)
    if (isApp) result.script = _config.apps+'/'+opts.script
    else result.script = process.cwd()+'/'+opts.script
  }

  // handle `nexus start appName`
  if (!result.script) {
    var maybeApp = opts.script.split('/')[0]
    if (path.existsSync(_config.apps+'/'+maybeApp)) {
      // console.log('---- A')
      var appPath = _config.apps+'/'+maybeApp
      var pkg = require(appPath+'/package.json')
      if (pkg.scripts && pkg.scripts.start) {
        // console.log('---- AA')
        var startScript = pkg.scripts.start
        if (/\w/.test(startScript)) {
          // console.log('---- AAA')
          var split = startScript.split(' ')
          var isScript = path.existsSync(appPath+'/'+split[0])
          if (isScript) {
            // console.log('---- AAAA')
            result.script = appPath+'/'+split[0]
            result.options = split.splice(1)
          }
          else {
            // console.log('---- AAAB')
            result.command = split[0]
            result.script = appPath+'/'+split[1]
            result.options = split.splice(2)
          }
        }
        else {
          // console.log('---- AAB')
          result.script = appPath+'/'+startScript
        }
      }
      else {
        // console.log('---- AB')
        var serverJsExists = path.existsSync(appPath+'/server.js')
        var appJsExists = path.existsSync(appPath+'/app.js')
        if (serverJsExists) result.script = appPath+'/server.js'
        else if (appJsExists) result.script = appPath+'/app.js'
        else result.script = appPath
      }
    }
  }
  
  var split = result.script.split('/')
  split.pop()
  result.cwd = split.join('/')
  
  cb(null, result)
}

