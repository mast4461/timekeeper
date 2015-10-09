var now = function() {
	return (new Date()).getTime();
};

var sum = function(data) {
	// Initialize empty object
	var time = {};

	// For each point in the data except the earliest
	for (var k = 1; k < data.length; k++) {
		// Calculate the time difference to the previous point
		var i = data[k].i;
		var t = data[k].t - data[k-1].t;

		// Add the time for the activity
		if (!(i in time)) time[i] = 0;
		time[i] += t;
	}

	// Initialize an empty array
	var timeArray = [];
	// For each entry in the time object push an object to the array
	for (var i in time) {
		timeArray.push({i:i, t: time[i]});
	}

	return timeArray;
};

// milliseconds to hours
var ms2h = function(ms) {
	return ms/3600000;
};

var durationMsToString = function(ms) {
	return ms2hq(ms) + ' (' + ms2h(ms).toFixed(4) + ') h'
};

// milliseconds to hours rounded to nearest quarter
var ms2hq = function(ms) {
	return quantize(ms2h(ms), 0.25).toFixed(2);
};

// round hours to nearest quarter hour
var quantize = function(number, quanta) {
	return Math.round(number/quanta)*quanta;
};

var timeMs2Hhmm = function(ms) {
	var date = new Date(ms);
	return date.toTimeString().slice(0,5);
};

exports.sum = sum;
exports.now = now;
exports.ms2h = ms2h;
exports.timeMs2Hhmm = timeMs2Hhmm;
exports.durationMsToString = durationMsToString;