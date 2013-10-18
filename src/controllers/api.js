var env = process.env.NODE_ENV || 'development';
var config = require("../configs")[env];

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
  
  if (!pathToVideo) {
    return res.send(400, {status: 'error', data: "pathToVideo not provided"});
  }
  
  res.send( 200, { status: 'success', data: msg } );
};