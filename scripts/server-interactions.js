var url = 'http://localhost:8768/api/';

// From http://www.html5rocks.com/en/tutorials/cors/
var createCORSRequest = function(method, url) {
	var xhr = new XMLHttpRequest();
	if ("withCredentials" in xhr) {

		// Check if the XMLHttpRequest object has a "withCredentials" property.
		// "withCredentials" only exists on XMLHTTPRequest2 objects.
		xhr.open(method, url, true);

	} else if (typeof XDomainRequest != "undefined") {

		// Otherwise, check if XDomainRequest.
		// XDomainRequest only exists in IE, and is IE's way of making CORS requests.
		xhr = new XDomainRequest();
		xhr.open(method, url);

	} else {

		// Otherwise, CORS is not supported by the browser.
		xhr = null;

	}
	if (!xhr) {
		throw new Error('CORS not supported');
	} else {
		return xhr;
	}
}


// All data has to be written and read, including activity names and comments
exports.write = function(data) {
	var xhr = createCORSRequest('POST', url);
	xhr.send(JSON.stringify(data));
};

exports.read = function(callback) {
	var xhr = createCORSRequest('GET', url);
	xhr.onload = function() {
		var obj = JSON.parse(xhr.responseText);
		console.log("Server read");
		console.log(obj);
		callback(obj);
	}
	xhr.send();
};

