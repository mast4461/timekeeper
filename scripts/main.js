var testData = require('./test-data');
var serverInteractions = require('./server-interactions');
var timeModule = require('./time-module');
var sumsModule = require('./sums-module');
var fileModule = require('./file-module');


// Declare variables
var hUnit = 50;
var r = 10;
var wMargin = 4*r;
var finished = false;
var sortedData;

var updateDisplayTimer;


// Add button listeners
d3.select('section#menu #save')
	.on('click', function() {
		fileModule.save({
			data: data,
			activityNames: activityNames
		});
	})
;

d3.select('section#menu #load')
	.on('change', function() {
		fileModule.load().then(function(loadedData) {
			console.log(loadedData);
			data = loadedData.data;
			activityNames = loadedData.activityNames;
		});
	})
;

// Get testdata
var activityNames = ['Default'];
var data;
(function() {
	var temp = testData.get(3);
	data = temp.data;
	activityNames = temp.activityNames;
})();

// Select objects
var activitiesList = d3.select('section#chart #right-column ul.activities');

// Create svg
var svg = d3.select('section#chart #left-column #chart-container')
	.append('svg')
	.attr('width', '100%')
;

var lineContainer = svg.append('g');
var pathContainer = svg.append('g');
var circleContainer = svg.append('g');




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


// Helper function for creating accessor function
var df = function(key) {
	return function(d) {
		return d[key];
	};
};

gt = df('t');
gi = df('i');


var tScale, tScaleInverse, iScale;
var updateScales = function() {
	var w = parseInt(svg.style('width'));
	var tRange = [wMargin, w-wMargin];
	var tDomain = d3.extent(data, gt);
	if (tDomain[1] - tDomain[0] < 60000) {
		tDomain[1] = tDomain[0] + 60000;
	};

	tScale = d3.scale.linear()
		.domain(tDomain)
		.range(tRange)
	;

	tScaleInverse = d3.scale.linear()
		.domain(tRange)
		.range(tDomain)
	;


	var iDomain = d3.extent(data, gi);
	iScale = d3.scale.linear()
		.domain(iDomain)
		.range([hUnit*0.5,(iDomain[1]-iDomain[0]+0.5)*hUnit])
	;
};

var xFunction = function(d) {
	return tScale(d.t);
};

var yFunction = function(d) {
	return iScale(d.i);
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

			svg
				.append('text')
				.attr('text-anchor', 'middle')
				.attr('x', x)
				.attr('y', parseInt(target.attr('cy')) - r)
				.text('' + timeModule.timeMs2Hhmm(t))
			;
		}
	)
	.on('drag',
		function(d, i) {
			var target = d3.select(this);

			var x = d3.event.x;
			target.attr('cx', x);

			var t = tScaleInverse(x);
			data[i].t = t;

			svg
				.select('text')
				.attr('x', x)
				.text('' + timeModule.timeMs2Hhmm(t))
			;

			updateDisplay();
		}
	)
	.on('dragend',
		function() {
			// Update the last data point
			updateLastTime(data);

			// Update the graphics
			updateScales();
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

var sums;
var updateDisplay = function() {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));

	// Set i of the first circle to that of the last circle
	sortedData[0].i = sortedData[1].i;

	// Sum the time on each activity
	sums = timeModule.sum(sortedData);

	// Rescale the chart container if necessary
	svg.attr('height', activityNames.length*hUnit);


	// Horizontal lines for each activity
	var lines = lineContainer.selectAll('line').data(sums);
	lines
		.enter()
		.append('line')
	;
	lines
		.attr('x1', 0)
		.attr('x2', "100%")
		.attr('y1', yFunction)
		.attr('y2', yFunction)
	;

	// Update the path
	var lineGraph = pathContainer.selectAll('path').data([sortedData])
	lineGraph
		.enter()
		.append('path')
	;
	lineGraph
		.attr('d', lineFunction)
	;

	// Join the data for the circles
	var circles = circleContainer.selectAll('circle').data(sortedData);

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
	;

	// Create divs for all activities
	var activities = activitiesList
		.selectAll('.activity')
		.data(sums)
	;

	activities
		.enter()
		.append('li')
		.classed('activity', true)
		.classed('block', true)
		.on('click', switchToActivity)
	;

	activities
		.style('height', hUnit + 'px')
		.style('line-height', hUnit/2 + 'px')
	;


	activities
		.html(function(d) {
			return activityNames[d.i] + '<br>' + timeModule.durationMsToString(d.t);
		})
	;


	sumsModule.updateDisplay(sums, activityNames);
	// printData(sortedData);

	// printData(sums);
};


var onResize = function() {
	updateScales();
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
	newDataPoint(activityNames.length);
	activityNames.push(activityName);
};

var switchToActivity = function(d, i) {
	newDataPoint(i);
};

var newDataPoint = function(i) {
	data.push({
		i: i,
		t: timeModule.now()
	});
	onResize();
};

var updateLastTime = function(data) {
	if (!finished) {
		data[data.length-1].t = timeModule.now();
	}
}

var activateUpdateDisplayTimer = function() {
	updateDisplayTimer = setInterval(function() {
		updateLastTime(data);
		updateScales();
		updateDisplay();
		// writeDataToServer();
	}, 1500);
}

var deactivateUpdateDisplayTimer = function() {
	clearInterval(updateDisplayTimer);
}


var writeDataToServer = function() {
	serverInteractions.write({
		data: data,
		activityNames: activityNames
	});
};

var readDataFromServer = function() {
	serverInteractions.read(function(readData) {
		data = readData.data;
		activityNames = readData.activityNames
	});
};

// readDataFromServer();

onResize();
activateUpdateDisplayTimer();