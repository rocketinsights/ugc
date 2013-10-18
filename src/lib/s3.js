var knox = require('knox');
var crypto = require('crypto');
var _ = require('underscore');

var createClient = function(config) {
  var s3 = knox.createClient({
    key: config.key,
    secret: config.secret,
    bucket: config.bucket
  });
  return s3;
};

var calculateSignedURL = function(config, options) {
  // options should have resource path and optional queryString
  var s3 = createClient(config.s3);
  var year = 1000 * 60 + 60 + 24 * 365;
  return s3.signedUrl(options.resource, new Date(Date.now() + year), {
    qs: options.queryString
  });
};

module.exports.createClient = createClient;
module.exports.calculateSignedURL = calculateSignedURL;
