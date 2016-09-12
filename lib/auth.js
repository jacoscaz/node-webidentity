
'use strict';

var HTTP = require('./http');
var CERT = require('./cert');
var STORE = require('./store');
var CACHE = require('./cache');
var JSONLD = require('./jsonld');
var ERRORS = require('./errors');

var debug = require('debug')('express:webid:auth');

function _authenticate(clientCertificate, webid, opts) {

  opts = opts || {};

  var cache = opts.cache;
  var store = opts.store;

  debug('Attempting authentication...');

  var webid, serverCertificate;

  return HTTP.getCertificate(webid)
    .catch(function (err) {
      throw new ERRORS.ServerCertificateError();
    })
    .then(function (_serverCertificate) {
      serverCertificate = _serverCertificate;
      return HTTP.requestRDFData(webid)
    })
    .spread(function (res, body) {
      var format = res.headers['content-type'];
      return JSONLD.parseRDF(body, format);
    })
    .then(function (data) {
      return STORE.insertGraph(store, webid, data, 'application/ld+json');
    })
    .then(function () {
      return STORE.queryGraph(store, webid, clientCertificate.fingerprint);
    })
    .then(function (success) {
      if (!success) {
        throw new ERRORS.ClientCertificateError();
      }
      debug('Authentication succeeded for webid %s', webid);
      var auth = {
        webid: webid,
        clientCertificate: clientCertificate.fingerprint,
        serverCertificate: serverCertificate.fingerprint
      };
      CACHE.set(cache, webid, auth);
      return auth;
    })
    .finally(function () {
      return STORE.deleteGraph(store, webid)
        .catch(function (err) {
          console.error(err);
        });
    });
}

function authenticate(clientCertificate, opts) {

  opts = opts || {};

  var cache = opts.cache;

  return CERT.extractWebid(clientCertificate)
    .then(function (webid) {
      var auth = CACHE.get(cache, webid);
      if (auth) {
        debug('Found cached auth.');
        return auth;
      }
      return _authenticate(clientCertificate, webid, opts);
    });
}

module.exports.authenticate = authenticate;