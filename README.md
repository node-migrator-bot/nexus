# nexus - remote program installation and control (work in progress/proof of concept)

         _______________________________
        /    ___  ___  _ _  _ _  ___    \
        |   |   || -_||_'_|| | ||_ -|   |
        |   |_|_||___||_,_||___||___|   |
        \_____________________________  / ____       ___
                                      \| / .  \  .-´/   \`-.
                                         \____ \/   \___/   \__
                                              \_`---´___`---´-´
                                               /../..\ /..\..\

[![build status](https://secure.travis-ci.org/guybrush/nexus.png)](http://travis-ci.org/guybrush/nexus)

* nexus provides a cli and a [dnode]-interface to install, uninstall, start,
  stop and observe local and remote programs (npm packages).
* running programs are `require('child_process').spawn`'ed child-processes of
  monitor-servers (dnode-clients). monitor-servers connect (and reconnect) to
  the nexus-server (dnode-server). the nexus-server is also a
  `require('child_process').spawn`'ed child-process of a monitor-server -
  which itself will connect (and reconnect) to its own child-process.
* all the config, logs and programs live in `~/.nexus` by default.
* nexus shells out into [npm], is built upon [dnode] and is inspired by
  [forever].
* nexus is still *super-alpha*.

[dnode]: https://github.com/substack/dnode
[forever]: https://github.com/nodejitsu/forever
[node]: http://nodejs.org
[npm]: https://npmjs.org

## install

* install [node]
* `npm install nexus -g`

## cli

```
nexus [-r <remote>] [-c <path to configFile>] [<command> [<options>]]

commands:

    version   .. print version-number
    config    .. print config
    ls        .. list installed packages
    install   .. install packages
    uninstall .. uninstall packages
    ps        .. list of current running (and crashed) programs
    start     .. start a program
    restart   .. restart a running (or max crashed) program
    stop      .. stop a running program
    stopall   .. stop all running programs
    runscript .. execute a script, defined in the package.json
    logs      .. access log-files
    subscribe .. subscribe to events
    server    .. start/stop/restart the nexus-server
    help      .. try `nexus help <command>` for more info

note: ps, restart, stop, stopall, subscribe and `logs clean`
      only work with a local or remote running nexus-server.
```

## config

the nexus-cli will create a `~/.nexus`-directory if it doesnt exist. you can
create a `~/.nexus/config.js`-file which exposes a json-object, or pass a
path to a `.js/.json`-file to the cli (`-c`) or to the nexus-constructor - it
will be `require()`'ed.

if no config is passed to the cli or constructor, the config is
`{socket:home+'/.nexus/socket'}` - where `home` is either
`process.env.HOME` or `process.env.USERPROFILE` depending on `process.platform`.

your config may look like this:
``` javascript
{ socket  : '/path/to/socket'    // if set, the nexus-server will listen on that UNIX-socket
                                 // local cli and monitor-servers will connect to it
, port    : 12345                // if set, the nexus-server will listen on that port
                                 // remote nexus-cli can connect (see -r option)
, host    : '0.0.0.0'
, key     : '/path/to/key.pem'   // if set, the nexus-server uses tls
, cert    : '/path/to/cert.pem'  // if set, the nexus-server uses tls
, ca      : '/path/to/ca'        // every file in that directory will be read into the ca
, remotes :                      // can be used with the cli: `nexus -r foo ps`
  { local : { port:12345, key:<key>, cert:<cert>, host:'0.0.0.0' }
  , foo   : { port:12346, key:<key>, cert:<cert>, host:'foo.com' }
  , bar   : { port:12347, key:<key>, cert:<cert>, host:'bar.com' }
  }
}
```
(at least `socket` or `port` (or both) must be set - everything else is
optional.

## api

```
// var config = '/some/file.js'
// var config = '/some/file.json'
var config = { socket: '/path/to/unix-socket', port: 5656 }

var nexus = require('nexus')(config)

nexus.version(cb)

nexus.config(cb)

nexus.install(opts,cb)

nexus.uninstall(name,cb)

nexus.ls(opts,cb)

nexus.ps(opts,cb)

nexus.start(opts,cb)

nexus.restart(opts,cb)

nexus.stop([id1,id2,..,idN],cb)

nexus.stopall(cb)

nexus.runscript(opts,stdout,stderr,cb)

nexus.logs(opts,cb)

nexus.subscribe(opts,cb)

nexus.server(opts,cb)

// you can use nexus as dnode-middleware like that (optional):

var dnode = require('dnode')
dnode(nexus).listen(3000)
```

