var controllers = require('../controllers');
var api = controllers.Api;

module.exports = function(app){
  //API
  app.get('/api/:accountID', api.getBrandingForUploadWidget);
  app.post('/api/upload/:accountID', api.uploadVideo);
};