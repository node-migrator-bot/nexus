#!/usr/bin/env node

process.title = 'nexus-server'

var nexus = require('../')
  , dnode = require('dnode')
  , AA = require('async-array')
  , _config = nexus.config()
  , confFile = process.argv[2]
  , opts = { port : _config.port
           , host : _config.host }

/*           
var key = fs.readFileSync(_config.key)
var cert = fs.readFileSync(_config.cert)
var ca = [cert]
var opts = {}
opts.port = _config.port
opts.host = _config.host
opts.key = key
opts.cert = cert
opts.ca = ca
opts.requestCert = true
opts.rejectUnauthorized = true
*/
var server = dnode(nexus(confFile)).listen(opts)
  