var data1 = [
	{t: 1430980332837, i: 2},
	{t: 1430981360434, i: 2},
	{t: 1430989300956, i: 1},
	{t: 1430992944254, i: 0},
	{t: 1430995933627, i: 3},
	{t: 1431003540000, i: 0},
	{t: 1431004808329, i: 2},
	{t: 1431010600239, i: 1},
];

var data2 = [
	{t: 1431368923534, i: 0},
	{t: 1431368929534, i: 0},
];

var d = new Date();
var now = d.getTime();
var data3 = [
	{t: now, i:0},
	{t: now+1000, i:0},
];

exports.data1 = data1;
exports.data2 = data2;
exports.data3 = data3;