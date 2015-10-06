var time = require('./time');

data = [];

data.push([
	{t: time.now()-1000, i:0},
	{t: time.now(), i:0},
]);

data.push([
	{t: 1430980332837, i: 2},
	{t: 1430981360434, i: 2},
	{t: 1430989300956, i: 1},
	{t: 1430992944254, i: 0},
	{t: 1430995933627, i: 3},
	{t: 1431003540000, i: 0},
	{t: 1431004808329, i: 2},
	{t: 1431010600239, i: 1},
]);

data.push([
	{t: 1431368923534, i: 0},
	{t: 1431368929534, i: 0},
]);

var processData = function(data) {
	var t = time.now();
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