var env = process.env.NODE_ENV || 'development';
var config = require("../configs")[env];
var s3 = require('../lib/s3').createClient(config.s3);
var Img = require('../lib/image');

module.exports.getBrandingForUploadWidget = function(req, res) {
  res.send({
    brand: {
     background: "#bada55" 
    },
    s3: {
      key: config.s3.key,
      secret: config.s3.secret,
      bucket: config.s3.bucket
    }
  });
};

module.exports.uploadVideo = function(req, res) {
  var data = req.body;
  var pathToVideo = data.pathToVide;
  var ext = req.files.file.name.split('.').pop();
  var fileName = req.files.file.name;
  
  var img = new Img(req.files.file.path, ext);
  img.s3write(s3, req.files.file.path, function(err) {
    if (err) {
      return res.send(500, {status: 'error'});
    }
    
    res.send( 200, { status: 'success', data: msg } );
  });
};