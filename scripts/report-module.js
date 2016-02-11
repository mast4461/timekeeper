var timeModule = require('./time-module');

var writeReport = function (intervals, sums, activityNames) {
	var nl = "\r\n";
	var tab = "\t";
	var tabtab = "\t\t";
	var sep = " | "

	var activities = activityNames.map(function (activityName, i) {
		var activity = activityName + sep + timeModule.durationMsToString(sums[i].t) + nl;

		sessions = intervals.filter(function (session) {
			return session.i === i;
		}).forEach(function (session) {
			activity += tab + timeModule.timeMs2Hhmm(session.t1)
				+ "-" + timeModule.timeMs2Hhmm(session.t2)
				+ sep + timeModule.durationMsToString(session.t2 - session.t1) + nl;

			activity += tabtab + session.c + nl;
		});

		return activity;
	});


	d3.select('#report').node().innerHTML = activities.join(nl);
};

exports.writeReport = writeReport;