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
    tracking_number: String
  }]
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
          packages: result.packages
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
                    packages: []
                });
              })
              .catch(err => {
                console.log(err);
                req.session.email = email_address;
                return res.render('dashboard', {
                    path: res.locals.path,
                    email: email_address,
                    packages: []
                });
              });
            }
          });
        } else {
          req.session.email = email_address;
          return res.render('dashboard', {
              path: res.locals.path,
              email: result.email,
              packages: result.packages
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
  return User.findOne({ email: req.session.email }, function(err, user) {
    if (err || !user || validator.isEmpty(tracking_number)) {
      delete req.session.email;
      return false;
    } else {
      user.packages.push({
        'tracking_number': tracking_number
      });
      return user.save(function(err) {
        if(err) {
          return false;
        } else {
          return true;
        }
      });
    }
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
