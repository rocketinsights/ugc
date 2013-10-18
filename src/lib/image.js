var async = require('async');
var config = require('../configs')[process.env.NODE_ENV || 'development'];
var gm = require('gm');
var imageMagick = gm.subClass({ imageMagick: true });
var mime = require('mime');
var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;

var rotation = {
  topleft: 0,
  bottomright: 180,
  lefttop: 90,
  righttop: 90,
  rightbottom: 90,
  leftbottom: 270
};

function Img(path, ext) {
  this.path = path;
  this.img = imageMagick(this.path);
  this.ext = ext || this.path.split('.').pop();
}

Img.prototype.autoOrient = function() {
  this.img = this.img.autoOrient().noProfile();
};

Img.prototype.getSize = function(callback) {
  var self = this;
  async.parallel({
    size: function(asyncCallback) {
      self.img.size(asyncCallback);
    },
    orientation: function(asyncCallback) {
      self.img.orientation(asyncCallback);
    }
  }, callback);
};

Img.prototype.resize = function(dim, callback) {
  var self = this;
  this.getSize(function(err, value) {
    if (err) {
      return callback(err);
    }
    if (!value) {
      return callback(new Error('Image not found'));
    }
    if (rotation[value.orientation.toLowerCase()] % 180 === 90) {
      var tmp = value.size.width;
      value.size.width = value.size.height;
      value.size.height = tmp;
    }
    // Resize so the proportionally smaller edge fills its bounds.
    var newDim = Img.getScaledContainer(value.size, dim);
    self.img = self.img.resize(newDim.width, newDim.height);
    // Crop the resized image
    var xOffset = Math.abs(newDim.width - dim.width) / 2;
    var yOffset = Math.abs(newDim.height - dim.height) / 2;
    self.img = self.img.crop(dim.width, dim.height, xOffset, yOffset);
    callback();
  });
};

// Scales the image to fit within the specified bounding box such that the
// largest dimension is equal to the corresponding dimension of the bounding
// box. The aspect ratio of the image is preserved.
Img.prototype.scale = function(dim, callback) {
  var self = this;
  this.getSize(function(err, value) {
    if(err) {
      return callback(err);
    }
    if (!value) {
      return callback(new Error('Image not found'));
    }
    if (rotation[value.orientation.toLowerCase()] % 180 === 90) {
      var tmp = value.size.width;
      value.size.width = value.size.height;
      value.size.height = value.size.width;
    }
    var newDim = Img.getScaledFit(value.size, dim);
    self.img = self.img.resize(newDim.width, newDim.height);
    callback();
  });
};

Img.getScaleToFit = function(size, bounds) {
  return Math.max(size.width / bounds.width, size.height / bounds.height);
};

Img.getScaleToContain = function(size, bounds) {
  return Math.min(size.width / bounds.width, size.height / bounds.height);
};

Img.getScaledFit = function(size, bounds) {
  var scale = Img.getScaleToFit(size, bounds);
  return {
    width: Math.round(size.width / scale),
    height: Math.round(size.height / scale)
  };
};

Img.getScaledContainer = function(size, bounds) {
  var scale = Img.getScaleToContain(size, bounds);
  return {
    width: Math.round(size.width / scale),
    height: Math.round(size.height / scale)
  };
};

Img.prototype.fswrite = function(path, callback) {
  this.img.write(path, callback);
};

// s3 is a knox client
Img.prototype.s3write = function(s3, path, callback) {
  var self = this;
  if (typeof(path) !== 'string') {
    return callback(new Error('Path must be a string'));
  }
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  this.img.toBuffer(function(err, buffer) {
    if (err) {
      return callback(err);
    }
    var headers = {
      'Content-Type': mime.lookup(self.ext),
      'x-amz-acl': 'public-read',
      // Cache-Control is used to force clients to get a new copy of the file
      // on their next request. This way updates to the file will be seen by
      // clients on next request, not whenever the cached image expires. Images
      // will be cached by clients until they are updated again.
      'Cache-Control': 'private, max-age=360'
    };
    s3.putBuffer(buffer, path, headers, callback);
  });
};

Img.prototype.addPlayIconAndWriteToS3 = function(dim, s3, dest, callback) {
  var videoIcon = path.join(__dirname, "..", "public", "images", "site", "moments", "play-icon-email.png");
  var input = path.join(__dirname, "..", "..", "tmp", dest.split("/").pop());
  var self = this;
  
  async.waterfall([
    function(cb) {
      self.img.size(cb);
    },
    function(realDim, cb) {
      var width = (realDim.width < realDim.height) ? 281 : dim.width; //TODO - get rid of magic number 281.  Get actual width
      var height = dim.height;

      var iconDiameter = 30;
      var x1 = width/2;
      var y1 = height/2;
      var x2 = x1;
      var y2 = y1 + iconDiameter;

      var playIconX1 = x1 - iconDiameter/3;
      var playIconY1 = y1 - iconDiameter/2;
      self.img.fill('rgba(0,0,0,.7)');
      self.img.drawCircle(x1,y1,x2,y2);
      self.img.fill('#ffffff');
      self.img.drawPolygon([playIconX1, playIconY1], [playIconX1 + iconDiameter, playIconY1 + iconDiameter/2], [playIconX1, playIconY1+iconDiameter]);
      self.img.toBuffer(cb);
    },
    function(buffer, cb) {
      var headers = {
        'Content-Type': mime.lookup(self.ext),
        'x-amz-acl': 'public-read',
        // Cache-Control is used to force clients to get a new copy of the file
        // on their next request. This way updates to the file will be seen by
        // clients on next request, not whenever the cached image expires. Images
        // will be cached by clients until they are updated again.
        'Cache-Control': 'private, max-age=360'
      };
      s3.putBuffer(buffer, dest, headers, cb);
    }
  ], callback);
};

Img.prototype.processScaleAndUpload = function(dim, s3, dest, callback) {
  var self = this;
  this.autoOrient();
  async.series([
    function(asyncCallback) {
      self.scale(dim, asyncCallback);
    },
    function(asyncCallback) {
      self.s3write(s3, dest, asyncCallback);
    }
  ], callback);
};

Img.prototype.processScaleAddWatermarkAndUpload = function(dim, s3, dest, callback) {
  var self = this;
  this.autoOrient();

  async.series([
    function(asyncCallback) {
      self.scale(dim, asyncCallback);
    },
    function(asyncCallback) {
      self.addPlayIconAndWriteToS3(dim, s3, dest, asyncCallback);
    }
  ], callback);
};

Img.prototype.processResizeAndUpload = function(dim, s3, dest, callback) {
  var self = this;
  this.autoOrient();
  async.series([
    function(asyncCallback) {
      self.resize(dim, asyncCallback);
    },
    function(asyncCallback) {
      self.s3write(s3, dest, asyncCallback);
    }
  ], callback);
};

Img.prototype.orientAndUpload = function(s3, dest, callback) {
  this.autoOrient();
  this.s3write(s3, dest, callback);
};

module.exports = Img;
