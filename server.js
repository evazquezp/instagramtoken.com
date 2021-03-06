"use strict";

var express = require('express');
var session = require('express-session');
var bodyParser = require("body-parser");
var http = require('http').Server(app);
var request = require('request');
var html = require('html');
var app = express();
var url = require('url');
var clientId, redirectUri, clientSecret, redirectUri, sess;

var donationCents = 100;

//dotenv
var dotenv = require('dotenv');
dotenv.load();

//stripe
const keyPublishable = process.env.PUBLISHABLE_KEY;
const keySecret = process.env.SECRET_KEY;
const stripe = require("stripe")(keySecret);

app.use(session({secret: 'thisemerson'}));
app.use(function(req, res, next){
    console.log(`${req.method} request for '${req.url}'`);
    next();
});
app.use(express.static("./public"));
app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));

app.listen(process.env.PORT || 3000);

app.post('/submit', function(req, res){
    sess = req.session;
    sess.client_id = req.body.client_id;
    sess.client_secret = req.body.client_secret;

    var scopes = [];

    scopes.push('basic');    
    if (req.body.scope_public_content) scopes.push('public_content');
    if (req.body.scope_follower_list) scopes.push('follower_list');
    if (req.body.scope_comments) scopes.push('comments');
    if (req.body.scope_relationships) scopes.push('relationships');
    if (req.body.scope_likes) scopes.push('likes');
    scopes = (scopes) ? '&scope='+scopes.join('+') : '';
        
    var redirect_uri = req.headers.referer;
    var base = 'https://api.instagram.com/oauth/authorize/?';
    var href = base +'redirect_uri='+redirect_uri+'&response_type=code'+scopes+'&client_id='+req.body.client_id;
    
    res.redirect(href);
});

app.get("/", function(req, res){

        // If there's no code param we're just showing the index
        if (!req.query.code)
            return res.render('index.ejs', {keyPublishable:keyPublishable, donationCents:donationCents});
        
        // These were saved during the /submit
        try {
            clientId = sess.client_id;
            clientSecret = sess.client_secret;
        } catch (e) {
            res.status(500).send('Problem with session vars. Are cookies enabled?');
        }

        // Erase saved client_secret for security
        sess.client_id = null;
        sess.client_secret = null;

        // Safety check for session vars properly set
        if ( !clientId || !clientSecret ) {
            res.status(500).send('Invalid client ID or secret.');
        }

        var ssl = ( req.headers['x-forwarded-proto'] || req.connection.encrypted ) ? true : false;

        // Build POST data for token request
        var formData = {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: 'https://instagramtoken.com/', //@TODO This won't work on localhost
            code : req.query.code
        };
        
        console.log('requesting token with:', formData);
        request.post({url:`https://api.instagram.com/oauth/access_token`, formData: formData}, function optionalCallback(err, httpResponse, body) {
            if (err) {
                console.log('Instagram token error:', err);
                res.status(500).send(err);
            }
            /*
            //RESPONSE SHOULD LOOK LIKE THIS:
            {
                "access_token": "fb2e77d.47a0479900504cb3ab4a1f626d174d2d",
                "user": {
                    "id": "1574083",
                    "username": "snoopdogg",
                    "full_name": "Snoop Dogg",
                    "profile_picture": "..."
                }
            }
            */
            var bodyJson = JSON.parse(body);
            var token = bodyJson.access_token;
            if (!token){
                var msg = (bodyJson.error_message == "Redirect URI doesn't match original redirect URI") ? 'You need to add https://instagramtoken.com to your client\'s Valid redirect URI' : body;
                res.status(500).send(body);
            }
            console.log('body', body);
            console.log('token', token);
            res.render('token.ejs', {token: token, keyPublishable: keyPublishable, donationCents:donationCents});
        });
});

app.post("/charge", (req, res) => {
  let amount = donationCents;

  stripe.customers.create({
     email: req.body.stripeEmail,
    source: req.body.stripeToken
  })
  .then(customer =>
    stripe.charges.create({
      amount,
      description: "Donation from instagramtoken.com",
         currency: "usd",
         customer: customer.id
    }))
  .then(charge => res.render("charge.ejs"));
});




var port = process.env.PORT || 3000;
console.log(`Express app running on port ${port}`);

module.exports = app;