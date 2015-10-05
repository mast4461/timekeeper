var time = require('./time');

var data1 = (function() {
	var t = time.now();
	var t0 = 1430980332837;
	return [
		{t: 1430980332837 - t0 + t, i: 2},
		{t: 1430981360434 - t0 + t, i: 2},
		{t: 1430989300956 - t0 + t, i: 1},
		{t: 1430992944254 - t0 + t, i: 0},
		{t: 1430995933627 - t0 + t, i: 3},
		{t: 1431003540000 - t0 + t, i: 0},
		{t: 1431004808329 - t0 + t, i: 2},
		{t: 1431010600239 - t0 + t, i: 1},
	]
})();

var data2 = [
	{t: 1431368923534, i: 0},
	{t: 1431368929534, i: 0},
];

var data3 = [
	{t: time.now(), i:0},
	{t: time.now()+1000, i:0},
];

exports.data1 = data1;
exports.data2 = data2;
exports.data3 = data3;