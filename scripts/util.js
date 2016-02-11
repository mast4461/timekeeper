Array.prototype.last = function() {
	return this[this.length - 1];
};

exports.compose = function (func1, func2) {
	return function() {
		return func1(func2.apply(null, arguments));
	};
};

exports.clamp = function (x, a, b) {
	a = a || -Infinity;
	b = b || Infinity;

	console.log(x,a,b);
	return Math.min(Math.max(a,x),b);
};

exports.setIntervalNow = function (func) {
	var argsForFunc = [].slice.call(arguments).slice(2);
	func.apply(null, argsForFunc);
	return setInterval.apply(null, arguments);
};