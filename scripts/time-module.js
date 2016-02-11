var now = function() {
	return (new Date()).getTime();
};

var sum = function (intervals, activityNames) {
	var sums = activityNames.map(function () { return 0; });
	intervals.forEach(function (interval) {
		sums[interval.i] += interval.t2 - interval.t1;
	});

	// Return array of indices and durations
	return sums.map(function (sum, i) {
		return { i: i, t: sum };
	});
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