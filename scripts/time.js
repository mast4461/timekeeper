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

var ms2h = function(ms) {
	return ms/3600000;
};

var durationMsToString = function(ms) {
	var h = ms2h(ms);
	var hQuarter = Math.round(h*4)/4;
	var hStr = h.toFixed(4);
	var hQuarterStr = hQuarter.toFixed(2);
	return hQuarterStr + ' (' + hStr + ') h'
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