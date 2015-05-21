var testData = require('./test-data.js');
var serverInteractions = require('./server-interactions.js');

// Width and height of chart
var chartContainer = d3.select('#chart-container');
var activityContainer = d3.select('#activity-container');

var w = 500;
var hUnit = 50;
var r = 10;
var wMargin = 4*r;
var activityCounter = 1;
var finished = false;
var sortedData;

var updateDisplayTimer;

var activityNames = ['Administrative work'];


// [time, index]
var data = testData.data3;

var sortData = function(data) {
	data.sort(function(a,b) {
		return a.t-b.t;
	});
	return data;
};

var copyData = function(data) {
	return data.slice(0);
};

var printData = function(data) {
	var str = "";
	data.forEach(function(item){
		str += "\nt: " + item.t + " i: " + item.i;
	});
	console.log(str);
};


var extrema, tScale, tScaleInverse, iScale;
var updateExtremaAndScales = function() {
	extrema = {
		t: {
			max: d3.max(data, function(d) {return d.t;}),
			min: d3.min(data, function(d) {return d.t;}),
		},
		i: {
			max: d3.max(data, function(d) {return d.i;}),
			min: d3.min(data, function(d) {return d.i;}),
		},
	};

	var tRange = [wMargin, w-wMargin];
	var tDomain = [extrema.t.min, extrema.t.max];

	tScale = d3.scale.linear()
		.domain(tDomain)
		.range(tRange)
	;

	tScaleInverse = d3.scale.linear()
		.domain(tRange)
		.range(tDomain)
	;

	iScale = d3.scale.linear()
		.domain([extrema.i.min-0.5, extrema.i.max+0.5])
		.range([0,(extrema.i.max-extrema.i.min+1)*hUnit])
	;
};

var xFunction = function(d) {
	return tScale(d.t);
	// return d.t;
};

var yFunction = function(d) {
	return iScale(d.i);
	// return d.i;
};

// Helper for drawing path
var lineFunction = d3.svg.line()
	.x(xFunction)
	.y(yFunction)
	.interpolate('step-before')
;

var drag = d3.behavior.drag()
	.on('dragstart',
		function() {
			deactivateUpdateDisplayTimer();

			var target = d3.select(this);
			var x = target.attr('cx');
			var t = tScaleInverse(x);

			yText =
			svg
				.append('text')
				.attr('text-anchor', 'middle')
				.attr('x', x)
				.attr('y', parseInt(target.attr('cy')) - r)
				.text('' + millisToHhmm(t))
			;
		}
	)
	.on('drag',
		function() {
			var target = d3.select(this);

			var x = d3.event.x;
			target.attr('cx', x);

			var t = tScaleInverse(x);
			data[target.attr('i')].t = t;

			svg
				.select('text')
				.attr('x', x)
				.text('' + millisToHhmm(t))
			;

			updateDisplay();
		}
	)
	.on('dragend',
		function() {
			// Update the last data point
			updateLastTime(data);

			// Update the graphics
			updateExtremaAndScales();
			updateDisplay();

			data = copyData(sortedData);

			svg
				.selectAll('text')
				.remove()
			;

			activateUpdateDisplayTimer();
		}
	)
;

// Create svg
var svg = chartContainer
	.append('svg')
	.attr('width', '100%')
	.attr('height', '100%')
;


var updateDisplay = function() {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));

	// Set i of the first circle to that of the last circle
	sortedData[0].i = sortedData[1].i;

	// Sum the time on each activity
	var sums = sumTime(sortedData);

	// Rescale the chart container if necessary
	chartContainer
		.style('height', (sums.length*hUnit+1)+'px')
	;

	// Horizontal lines for each activity
	var lines = svg.selectAll('line').data(sums);
	lines
		.enter()
		.append('line')
	;
	lines
		.attr('x1', 0)
		.attr('x2', w)
		.attr('y1', yFunction)
		.attr('y2', yFunction)
	;

	// Update the path
	var lineGraph = svg.selectAll('path').data([sortedData])
	lineGraph
		.enter()
		.append('path')
	;
	lineGraph
		.attr('d',lineFunction)
	;

	// Join the data for the circles
	var circles = svg.selectAll('circle').data(sortedData);

	// Create elements for new circles and add drag handler
	circles
		.enter()
		.append('circle')
		.call(drag)
	;

	// Update attributes for all updating circles
	circles
		.attr('cx', xFunction)
		.attr('cy', yFunction)
		.attr('r', r)
		.attr('i',function(d,i) {return i;})
	;

	// Create divs for all activities
	var activities = activityContainer
		.selectAll('.activity')
		.data(sums)

	activities
		.enter()
		.append('div')
		.classed('activity', true)
		.classed('block', true)
		.attr('i', function(d,i) {return i;})
		.call(switchToActivity)
	;

	activities
		.style('height', hUnit + 'px')
		.style('line-height', hUnit/2 + 'px')
	;


	activities
		.html(function(d) {
			// h is for hours in this scope
			var h = d.t/3600000;
			var hQuarter = Math.round(h*4)/4;
			// h = Math.round(h*4)/4;
			var hStr = h.toFixed(4);
			var hQuarterStr = hQuarter.toFixed(2);
			return activityNames[d.i] + '<br>' + hQuarterStr + ' (' + hStr + ') h'
		})
	;


	// printData(sortedData);

	// printData(sums);
	rescaleSvgToContainer();
};

var millisToHhmm = function(millis) {
	var date = new Date(millis);
	return date.toTimeString().slice(0,5);
};


var sumTime = function(data) {
	// Initialize empty object
	var time = {};

	// For each point in the data except the earliest
	for (var k = 1; k < data.length; k++) {
		// Calculate the time difference to the previous point
		var i = data[k].i;
		var t = data[k].t - data[k-1].t;
		// If no time has been summed for that index
		if (time[i] === undefined || time[i] === null) {
			// Set the time to t
			time[i] = t;
		} else {
			// Add t to the time
			time[i] += t;
		}
	}

	// Initialize an empty array
	var timeArray = [];
	// For each entry in the time object push an object to the array
	for (var i in time) {
		timeArray.push({t: time[i], i:i});
	}

	return timeArray;
};

var rescaleSvgToContainer = function() {
	var helper = function(attribute) {
		return parseInt(chartContainer.style(attribute));
	};
	w = helper('width');
	h = helper('height');
	// wMargin = w*0.1;

	svg
		.attr('width', w)
		.attr('height', h)
		.attr('viewBox', '0 0 ' + w + ' ' + h)
	;
};

var onResize = function() {
	rescaleSvgToContainer();
	updateExtremaAndScales();
	updateDisplay();
};
window.onresize = onResize;

// onSubmitActivity is declared in a script element in index.html
onSubmitActivity = function() {
	updateLastTime(data);

	var inputElement = document.getElementById('activity-name-input');
	var activityName = inputElement.value;
	inputElement.value = '';
	inputElement.blur();
	addNewActivity(activityName);

	updateDisplay();

	return false;
};

var addNewActivity = function(activityName) {
	newDataPoint(activityCounter);
	activityNames.push(activityName);
	activityCounter++;
};

var switchToActivity = d3.behavior.drag()
	.on('dragstart', function() {
		var i = d3.select(this).attr('i');
		newDataPoint(i);
	})
;

var newDataPoint = function(i) {
	var now = new Date();
	data.push({
		i: i,
		t: now.getTime()
	});
	onResize();
};

var updateLastTime = function(data) {
	if (!finished) {
		data[data.length-1].t = (new Date()).getTime();
	}
}

var activateUpdateDisplayTimer = function() {
	updateDisplayTimer = setInterval(function() {
		updateLastTime(data);
		updateExtremaAndScales();
		updateDisplay();
		writeDataToServer();
	}, 1500);
}

var deactivateUpdateDisplayTimer = function() {
	clearInterval(updateDisplayTimer);
}


var writeDataToServer = function() {
	serverInteractions.write({
		data: data,
		activityNames: activityNames,
	});
};

var readDataFromServer = function() {
	serverInteractions.read(function(readData) {
		data = readData.data;
		activityNames = readData.activityNames;
	});
};

readDataFromServer();

onResize();
rescaleSvgToContainer();
activateUpdateDisplayTimer();