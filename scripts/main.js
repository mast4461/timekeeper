var testData = require('./test-data');
var serverInteractions = require('./server-interactions');
var timeModule = require('./time-module');
var sumsModule = require('./sums-module');
var fileModule = require('./file-module');
var persistenceModule = require('./persistence-module');
var util = require('./util');


// Declare variables
var hUnit = 50;
var r = 10;
var wMargin = 4*r;
var finished = false;
var sortedData;

var updateDisplayTimer;


// Add button listeners
d3.select('section#menu #save')
	.on('click', function () {
		fileModule.save({
			data: data,
			activityNames: activityNames
		});
	})
;

d3.select('section#menu #load')
	.on('change', function () {
		fileModule.load().then(function (loadedData) {
			console.log(loadedData);
			data = loadedData.data;
			activityNames = loadedData.activityNames;
		});
	})
;

var loadTestData = function (i) {
	var temp = testData.get(i);
	data = temp.data;
	activityNames = temp.activityNames;
	lastLoaded = temp;
};

d3.select('section#menu #clear')
	.on('click', function () {
		var confirmed = confirm("Clear current data?");
		if (confirmed) {
			loadTestData(0);
			saveData();
			updateTScale();
			updateDisplay();
		}
	})
;

// Get testdata
var activityNames = ['Default'];
var data;
loadTestData(0);

// Select objects
var activitiesList = d3.select('section#chart #right-column ul.activities');

// Create svg
var svg = d3.select('section#chart #left-column #chart-container')
	.append('svg')
	.attr('width', '100%')
;

var svgBackground = svg.append('rect')
	.attr('width', '100%')
	.attr('height', '100%')
	.attr('fill', 'rgba(0,0,0,0)')
;
var lineContainer = svg.append('g').attr('id', 'line-container');
var pathContainer = svg.append('g').attr('id', 'path-container');
var circleContainer = svg.append('g').attr('id', 'circle-container');
var axisContainer = svg.append('g').attr('id', 'axis-container');
axisContainer
	.append('rect')
	.attr('width', '100%')
	.attr('height', '36')
	.attr('transform', 'translate(0, -36)')
	.attr('fill', 'rgba(0,0,0,0.5)')
;

var timeAxis = d3.svg.axis()
	.ticks(5)
	.orient('top')
	.tickFormat(timeModule.timeMs2Hhmm)
;

var zoomHandler = d3.behavior.zoom();
axisContainer.call(zoomHandler);

zoomHandler.on('zoom', function () {
	// console.log(d3.event.translate);
	updateDisplay();
});

document.body.addEventListener('wheel', function (event) {
	console.log(event);
});


var sortData = function (data) {
	data.sort(function (a,b) {
		return a.t-b.t;
	});
	return data;
};

var copyData = function (data) {
	return data.slice(0);
};

var printData = function (data) {
	var str = "";
	data.forEach(function (item){
		str += "\nt: " + item.t + " i: " + item.i;
	});
	console.log(str);
};


// Helper function for creating accessor function
var df = function (key) {
	return function (d) {
		return d[key];
	};
};

gt = df('t');
gi = df('i');


var durationMin = 5*60*1000;

var tScale, iScale;
var updateTScale = function () {
	var w = parseInt(svg.style('width'));
	// var tRange = [wMargin, w-wMargin];
	var tRange = [0, w];
	var tDomain = d3.extent(data, gt);

	if (tDomain[1] - tDomain[0] < durationMin) {
		tDomain[1] = tDomain[0] + durationMin;
	};

	var tMargin = (tDomain[1]-tDomain[0])*0.05;
	tDomain[0] -= tMargin;
	tDomain[1] += tMargin;

	tScale = d3.scale.linear()
		.domain(tDomain)
		.range(tRange)
	;

	timeAxis.scale(tScale);
	zoomHandler.x(tScale);
};

var updateIScale = function () {
	var iDomain = [0, activityNames.length-1];
	var iRange = [hUnit*0.5,(iDomain[1]-iDomain[0]+0.5)*hUnit];
	iScale = d3.scale.linear()
		.domain(iDomain)
		.rangeRound(iRange)
		.clamp(true)
	;
};

var xFunction = function (d) {
	return tScale(d.t);
};

var yFunction = function (d) {
	return iScale(d.i);
};

// Helper for drawing path
var lineFunction = d3.svg.line()
	.x(xFunction)
	.y(yFunction)
	.interpolate('step-before')
;

var dragCircle = d3.behavior.drag()
	.on('dragstart',
		function () {
			deactivateUpdateDisplayTimer();

			var target = d3.select(this);
			var x = target.attr('cx');
			var t = tScale.invert(x);

			circleContainer
				.append('text')
				.attr('text-anchor', 'middle')
				.attr('x', x)
				.attr('y', parseInt(target.attr('cy')) - r)
				.text('' + timeModule.timeMs2Hhmm(t))
			;
		}
	)
	.on('drag',
		function (d, i) {
			var target = d3.select(this);

			var x = d3.event.x;
			var y = d3.event.y;
			// target.attr('cy', y);

			var t = tScale.invert(x);
			var iNew = Math.round(iScale.invert(y));
			data[i].t = t;
			data[i].i = iNew;

			target.attr('cx', x);
			target.attr('cy', y);

			circleContainer
				.select('text')
				.attr('x', x)
				.attr('y', iScale(iNew) - r)
				.text('' + timeModule.timeMs2Hhmm(t))
			;

			updateDisplay();
		}
	)
	.on('dragend',
		function () {
			// Update the last data point
			updateLastTime(data);

			// Update the graphics
			updateDisplay();

			data = copyData(sortedData);

			circleContainer
				.selectAll('text')
				.remove()
			;

			activateUpdateDisplayTimer();

			saveData();
		}
	)
;

var sums;
var updateDisplay = function () {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));

	// Set i of the first circle to that of the last circle
	sortedData[0].i = sortedData[1].i;

	// Sum the time on each activity
	sums = timeModule.sum(sortedData, activityNames);

	// Rescale the chart container if necessary
	var height = activityNames.length*hUnit + 36
	svg.attr('height', height);

	// Update timeAxis
	axisContainer.attr('transform', 'translate(0,' + height + ')');
	axisContainer.call(timeAxis);
	timeAxis.ticks(5);


	// Horizontal lines for each activity
	var lines = lineContainer.selectAll('line').data(sums);
	lines
		.enter()
		.append('line')
	;
	lines.exit().remove();
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
	lineGraph.exit().remove();
	lineGraph
		.attr('d', lineFunction)
	;

	// Join the data for the circles
	var circles = circleContainer.selectAll('circle').data(sortedData);

	// Create elements for new circles and add drag handler
	circles
		.enter()
		.append('circle')
		.call(dragCircle)
	;
	circles.exit().remove();

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

	var newActivities = activities
		.enter()
		.append('li')
		.classed('activity', true)
		.classed('block', true)
	;

	newActivities
		.append('div')
		.classed('switch', true)
		.text('>')
		.on('click', switchToActivity)
	;

	newActivities
		.append('input')
		.attr('type', 'text')
		.attr('value', function (d) {
			return activityNames[d.i];
		})
		.on('input', function (d, i) {
			activityNames[i] = this.value;
		})
	;

	newActivities
		.append('div')
		.classed('time', true)
	;

	activitiesList.selectAll('.time')
		.data(sums)
		.text(function (d) {
			return timeModule.durationMsToString(d.t);
		})
	;



	activities.exit().remove();

	activities
		.style('height', hUnit + 'px')
		.style('line-height', hUnit/2 + 'px')
	;


	sumsModule.updateDisplay(sums, activityNames);
	// printData(sortedData);

	// printData(sums);

};


var onResize = function () {
	updateDisplay();
	tScale.range([0, parseInt(svg.style('width'))]);
};

window.onresize = onResize;

// onSubmitActivity is declared in a script element in index.html
onSubmitActivity = function () {
	updateLastTime(data);

	var inputElement = document.getElementById('activity-name-input');
	var activityName = inputElement.value;
	inputElement.value = '';
	inputElement.blur();
	addNewActivity(activityName);

	updateDisplay();

	return false;
};

var addNewActivity = function (activityName) {
	activityNames.push(activityName);
	updateIScale();
	updateDisplay();
	switchToActivity(null, activityNames.length - 1);
	saveData();
};

var switchToActivity = function (d, i) {
	newDataPoint(i);
	setActiveActivity(i);
};

var setActiveActivity = function (i) {
	var switches = activitiesList.selectAll('.switch')
		.classed('active', false);
	d3.select(switches[0][i]).classed('active', true);
};

var newDataPoint = function (i) {
	data.push({
		i: i,
		t: timeModule.now()
	});

	saveData();

	onResize();
};

var updateLastTime = function (data) {
	if (!finished) {
		data[data.length-1].t = timeModule.now();
	}
};

var activateUpdateDisplayTimer = function () {
	updateDisplayTimer = util.setIntervalNow(function () {
		updateLastTime(data);
		updateDisplay();
	}, 1000);
};

var deactivateUpdateDisplayTimer = function () {
	clearInterval(updateDisplayTimer);
};

var saveData = function () {
	persistenceModule.saveData({
		data: data,
		activityNames: activityNames
	});
};

var loadData = function () {
	var loadedData = persistenceModule.loadData();
	if (loadedData) {
		data = loadedData.data;
		activityNames = loadedData.activityNames;
	}
	updateIScale();
	updateTScale();
};

loadData();

updateTScale();
updateIScale();
onResize();
activateUpdateDisplayTimer();
setActiveActivity(data[data.length-1].i);