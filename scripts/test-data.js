var timeModule = require('./time-module');

var c = "<comment>";

data = [];

data.push([
	{t: timeModule.now(), i: 0, c: c},
]);


data.push([
	{t: 1430980332837, i: 2, c: c},
	{t: 1430981360434, i: 2, c: c},
	{t: 1430989300956, i: 1, c: c},
	{t: 1430992944254, i: 0, c: c},
	{t: 1430995933627, i: 3, c: c},
	{t: 1431003540000, i: 0, c: c},
	{t: 1431004808329, i: 2, c: c},
	{t: 1431010600239, i: 1, c: c},
]);

data.push([
	{t: 1431368923534, i: 0, c: c},
	{t: 1431368929534, i: 0, c: c},
]);

data.push([
	{t:  1000, i: 0, c: c},
	{t:  9000, i: 0, c: c},
	{t: 20000, i: 1, c: c},
	{t: 49000, i: 2, c: c},
	{t: 54000, i: 0, c: c},
]);

var processData = function(data) {
	var t = timeModule.now();
	var tLast = data[data.length-1].t;
	return data.map(function(item) {
		item.t += t - tLast;
		return item;
	});
}

var generateNames = function(data) {
	var iAll = {};
	data.forEach(function(item) {
		if (!(item.i in iAll)) iAll[item.i] = 0;
	})
	var names = Object.keys(iAll).map(function(item, index) {
		return "Activity" + index;
	});
	return names;
};

var get = function(n) {
	if (n === undefined) n = 0;

	return {
		data: processData(data[n]),
		activityNames: generateNames(data[n])
	}
};


exports.get = get;