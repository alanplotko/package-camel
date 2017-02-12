// --------- Dependencies ---------
var express = require('express');
var favicon = require('serve-favicon');
var app = express();
var path = require('path');
var flash = require('connect-flash');
var bodyParser = require('body-parser');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var cookieParser = require('cookie-parser');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
mongoose.Promise = require('bluebird');
var validator = require('validator');
var debug = process.env.PKGCAMEL_DEBUG != null;
require('express-mongoose');
var SparkPost = require('sparkpost');
var sparkpost_client = new SparkPost(process.env.PKGCAMEL_SPARKPOST);


// --------- Support bodies ---------
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// --------- Path setup and configuration ---------
app.use(function(req, res, next) {
    var pathStr = req.path;
    if (req.path.length != 1 && req.path.substr(-1) == "/") pathStr = req.path.substring(0, req.path.length - 1);
    res.locals = {
        path: pathStr
    }
    next();
});

const dir = path.resolve(__dirname, '..');
app.use(favicon(dir + '/public/favicon.ico'));
app.use('/public', express.static(dir + '/public/'));
app.use('/semantic', express.static(dir + '/node_modules/semantic-ui/dist/'));
app.use('/jquery', express.static(dir + '/node_modules/jquery/dist/'));
app.use('/moment', express.static(dir + '/node_modules/moment/min/'));
app.use('/assets', express.static(dir + '/assets/'));
app.use(function(req, res, next) {
    var pathStr = req.path;
    if (req.path.length != 1 && req.path.substr(-1) == "/") pathStr = req.path.substring(0, req.path.length - 1);
    res.locals = {
        path: pathStr
    }
    next();
});

// --------- MongoDB & Mongoose Setup ---------
mongoose.connect(process.env.PKGCAMEL_MONGODB, function(err) {
  if (err) {
    throw err;
  }
  if (debug) {
    console.log('Successfully connected to MongoDB');
  }
});

// --------- Authentication Setup ---------
app.use(cookieParser());
app.use(session({
  secret: 'T!\4C]aD82t2\N;9Y{yFdtaJ?eX,]7AVL)wFV,^r?.ucP^=yqK4',
  store: new MongoStore({mongooseConnection: mongoose.connection}),
  resave: true,
  saveUninitialized: true
}));
app.use(flash());

var upsAPI = require('shipping-ups');
var ups = new upsAPI({
  environment: 'sandbox', // or live
  username: process.env.PKGCAMEL_UPS_USERNAME,
  password: process.env.PKGCAMEL_UPS_PASSWORD,
  access_key: process.env.PKGCAMEL_UPS_KEY,
  imperial: true
});


// --------- Assets Setup ---------
app.use('/static', express.static(path.join(__dirname, '/assets')));
app.set('view engine', 'pug');

// Use moment library on Pug variables
app.locals.moment = require('moment');

// App locals configuration
app.locals.title = "Package Camel";
app.locals.navigation = [{
  title: 'Home',
  url: '/'
}, {
  title: 'Dashboard',
  url: '/dashboard'
}, {
  title: 'Settings',
  url: '/settings'
}];

// Schemas
var userSchema = new Schema({
  email: {
    type: String,
    index: {
      unique: true
    }
  },
  packages: [{
    tracking_number: String,
    method: String,
    weight: String,
    from: Object,
    to: Object,
    activity: Object
  }],
  subscriptions: Object
});

var User = mongoose.model('User', userSchema, 'user');

// --------- General Routes ---------
app.get('/', function(req, res) {
  if (req.session.email && !validator.isEmpty(req.session.email)) {
    return res.redirect('/dashboard');
  }
  var error_message = req.session.invalid_email;
  delete req.session.invalid_email;
  return res.render('index', {
    path: res.locals.path,
    error: error_message
  });
});

app.get('/dashboard', function(req, res) {
  User.findOne({ email: req.session.email }, function(err, result) {
    if (err || !result) {
      delete req.session.email;
      return res.redirect('/');
    } else {
      return res.render('dashboard', {
          path: res.locals.path,
          email: result.email,
          packages: result.packages,
          error: req.flash('invalid_tracking_error')
      });
    }
  });
});

app.post('/dashboard', function(req, res) {
  var email_address = validator.trim(validator.escape(req.body.email));
  if (!validator.isEmpty(email_address) && validator.isEmail(email_address)) {
    User.findOne({ email: email_address }, function(err, result) {
        if (err || !result) {
          var user = new User({
            email: email_address
          });

          return user.save(function(err) {
            if (err) {
              req.session.invalid_email = "We couldn't create your account!<br />Please try again in a few moments.";
              return res.redirect('/');
            } else {
              sparkpost_client.transmissions.send({
                content: {
                  from: 'postmaster@packagecamel.alanplotko.com',
                  subject: 'Welcome!',
                  html:'<html><body><p>Welcome to Package Camel!</p><p>You can now begin adding packages for tracking!</p><p>Enjoy!</p></body></html>'
                },
                recipients: [{
                  address: email_address
                }]
              })
              .then(data => {
                console.log(data);
                req.session.email = email_address;
                return res.render('dashboard', {
                    path: res.locals.path,
                    email: email_address,
                    packages: [],
                    error: req.flash('invalid_tracking_error')
                });
              })
              .catch(err => {
                console.log(err);
                req.session.email = email_address;
                return res.render('dashboard', {
                    path: res.locals.path,
                    email: email_address,
                    packages: [],
                    error: req.flash('invalid_tracking_error')
                });
              });
            }
          });
        } else {
          req.session.email = email_address;
          return res.render('dashboard', {
              path: res.locals.path,
              email: result.email,
              packages: result.packages,
              error: req.flash('invalid_tracking_error')
          });
        }
    });
  } else {
    req.session.invalid_email = "We couldn't validate your email!<br />Please check and try again.";
    return res.redirect('/');
  }
});

app.post('/add/tracking', function(req, res) {
  var tracking_number = validator.trim(validator.escape(req.body.tracking_number));
  User.findOne({ email: req.session.email }, function(err, user) {
    if (err || !user || validator.isEmpty(tracking_number)) {
      delete req.session.email;
      req.flash('invalid_tracking_error', 'Invalid tracking number. Please try again.');
      res.send(req.flash());
      return false;
    } else {
      ups.track(tracking_number, function(err, result) {
        console.log(err);
        console.log(result);
        if (err) {
          req.flash('invalid_tracking_error', 'Invalid tracking number. Please try again.');
          res.send(req.flash());
          return false;
        } else {
          delete req.session.invalid_tracking;
          for (var i in user.packages) {
            if (user.packages[i].tracking_number === tracking_number) {
              req.flash('invalid_tracking_error', 'You\'re already tracking this package.');
              res.send(req.flash());
              return false;
            }
          }
          user.packages.push({
            'tracking_number': tracking_number,
            'method': result.Shipment.Service.Description,
            'weight': result.Shipment.ShipmentWeight.Weight + " " + result.Shipment.ShipmentWeight.UnitOfMeasurement.Code.toLowerCase() + ".",
            'from': result.Shipment.Shipper.Address,
            'to': result.Shipment.ShipTo.Address,
            'activity': result.Shipment.Package.Activity
          });
          return user.save(function(err) {
            if(err) {
              req.flash('invalid_tracking_error', 'An error occurred. Please try again.');
              res.send(req.flash());
              return false;
            } else {
              return true;
            }
          });
        }
      });
    }
  });
});

app.get('/track/:tracking_number', function(req, res) {
  var tracking_number = validator.trim(validator.escape(req.params.tracking_number));
  User.findOne({ email: req.session.email }, function(err, user) {
    if (err) return res.redirect('/');
    for (var i in user.packages) {
      if (user.packages[i].tracking_number === tracking_number) {
        console.log('True');
        return res.render('track', {
            path: res.locals.path,
            selected_package: user.packages[i]
        });
      }
    }
    return res.render('track', {
      path: res.locals.path,
      selected_package: null
    });
  });
});

app.get('/settings', function(req, res) {
  User.findOne({ email: req.session.email }, function(err, user) {
    if (err || !user) return res.redirect('/');

    return res.render('settings', {
        path: res.locals.path,
        settings: user.subscriptions == undefined ? {} : user.subscriptions
    });
  });
});

app.post('/update/notifications', function(req, res) {
  User.findOne({ email: req.session.email }, function(err, user) {
    if (err || !user) return res.redirect('/');
    if (user) {
      user.subscriptions = req.body;
      user.save(function(err, result) {
        return res.redirect('/settings');
      })
    } else {
      return res.redirect('/settings');
    }
  });
});

app.get('/update/all/users', function(req, res) {
  User.find({}, function(err, users) {
    users.forEach(function(user) {
      for (var i = 0; i < user.packages.length; i++) {
        var activity = user.packages[i].activity;
        var currIdx = i;
        ups.track(user.packages[i].tracking_number, function(err, result) {
          if (err) {
            return;
          } else {
            user.packages[currIdx].activity = result.Shipment.Package.Activity;
            user.save(function(err) {
              if(err) {
                return;
              } else {
                if (activity.length < user.packages[currIdx].activity.length) {
                  var diff = user.packages[currIdx].activity.length - activity.length - 1;
                  for (var j = diff; j >= 0; j--) {
                    var message = null;
                    console.log(j);
                    if (user.packages[j].activity.Status.StatusType.Description.toLowerCase().includes('delivered') &&
                      user.subscriptions.hasOwnProperty('delivered')) {
                      message = "Your package has been marked as delivered by UPS!"
                    }
                    else if (user.packages[j].activity.Status.StatusType.Description.toLowerCase().includes('out for delivery') &&
                      user.subscriptions.hasOwnProperty('out_for_delivery')) {
                      message = "Your package has been marked as out for delivery!"
                    }
                    else if (user.packages[j].activity.Status.StatusType.Description.toLowerCase().includes('departure scan') &&
                      user.subscriptions.hasOwnProperty('departure_scan')) {
                      message = "Your package has just departed " + user.packages[j].activity.user.packages[j].activityLocation.Address.City + ", " + user.packages[j].activity.user.packages[j].activityLocation.Address.StateProvinceCode + "!"
                    }
                    else if (user.packages[j].activity.Status.StatusType.Description.toLowerCase().includes('arrival scan') &&
                      user.subscriptions.hasOwnProperty('arrival_scan')) {
                      message = "Your package has just arrived at " + user.packages[j].activity.user.packages[j].activityLocation.Address.City + ", " + user.packages[j].activity.user.packages[j].activityLocation.Address.StateProvinceCode + "!"
                    }
                    else if (user.packages[j].activity.Status.StatusType.Description.toLowerCase().includes('origin') &&
                      user.subscriptions.hasOwnProperty('origin')) {
                      message = "Your package has just gone through the origin scan!"
                    }
                    else if (user.packages[j].activity.Status.StatusType.Description.toLowerCase().includes('billing information received') &&
                      user.subscriptions.hasOwnProperty('billing_information_received')) {
                      message = "UPS has received billing information for your package!"
                    }
                    if (message != null) {
                      sparkpost_client.transmissions.send({
                        content: {
                          from: 'postmaster@packagecamel.alanplotko.com',
                          subject: '[Update] ' + user.packages[j].tracking_number,
                          html:'<html><body><p>Hi there!</p><p>' + message + '</p><p>Enjoy!</p></body></html>'
                        },
                        recipients: [{
                          address: user.email
                        }]
                      })
                      .then(data => {
                        console.log(data);
                      })
                      .catch(err => {
                        console.log(err);
                      });
                    }
                  }
                }
              }
            });
          }
        });
      }
    });
  });
});

// --------- Miscellaneous Routes & Helper Functions ---------

/**
 * If the route does not exist (error 404), go to the error page.
 * This route must remain as the last defined route, so that other
 * routes are not overridden!
 */
app.all('*', function(req, res, next) {
  res.render('error', {
    status: 404,
    message: 'Page Not Found',
    description: 'That\'s strange! We couldn\'t find what you wear looking for! Let\'s bring you back home.'
  });
});

// Run App
var server = app.listen(3000, function() {
  if (debug) {
    var host = (server.address().address === '::') ? 'localhost' :
    server.address().address;
    var port = server.address().port;
    console.log('Listening on %s:%s', host, port);
  }
});
