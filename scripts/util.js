exports.clamp = function(x,a,b) {
	a = a || -Infinity;
	b = b || Infinity;

	console.log(x,a,b);
	return Math.min(Math.max(a,x),b);
};