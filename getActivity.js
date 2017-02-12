var upsAPI = require('shipping-ups');
const express = require('express');

const app = express();
const port = 3000;

var ups = new upsAPI ({
	environment: 'sandbox',
	username: process.env.ups_un,
	password: process.env.ups_pw,
	access_key: '3D215C958604E31C',
	imperial: true
    });

var trackingNumber = "1Z87V5000397494457";

var tracked;
    
app.get('/', (request, response) => {  
	ups.track(trackingNumber, function(err, result) {
		if(err) {
		    console.log(err);
		}
		else if(result) {
		    console.log("result:");
		    console.log(result);
		    tracked = result;
		    console.log("Package Activity:");
		    //console.log(result.Shipment.Package.Activity);
		    for(var activity in result.Shipment.Package.Activity) {
			console.log(result.Shipment.Package.Activity[activity]);
		    }
		}
		else {
		    console.log("idgi");
		}
		console.log("done");
	    });
    });

app.listen(port, (err) => {  
	if (err) {
	    return console.log('something bad happened', err);
	}
	
	console.log(`server is listening on ${port}`);
    });
