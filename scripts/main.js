var testData = require('./test-data');
var serverInteractions = require('./server-interactions');
var timeModule = require('./time-module');
var sumsModule = require('./sums-module');
var fileModule = require('./file-module');
var persistenceModule = require('./persistence-module');
var reportModule = require('./report-module');
var util = require('./util');


// Declare variables
var hUnit = 50;
var r = 10;
var wMargin = 4*r;
var sortedData;

var updateDisplayTimer;
var tNow = timeModule.now();
var autoUpdate = true;


var g = function (key) {
	return function(obj) {
		return obj[key];
	};
};

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
			activitiesList.selectAll('*').remove();
			data = loadedData.data;
			activityNames = loadedData.activityNames;
			updateIScale();
			updateTScale();
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
	.attr('id', 'svg-background')
;
var defs = svg.append('defs');
var lineContainer = svg.append('g').attr('id', 'line-container');
var pathContainer = svg.append('g').attr('id', 'path-container');
var circleContainer = svg.append('g').attr('id', 'circle-container');
var nowLineContainer = svg.append('g').attr('id', 'now-line-container');
var axisContainer = svg.append('g').attr('id', 'axis-container');
axisContainer
	.append('rect')
	.attr('width', '100%')
	.attr('height', '36')
	.attr('transform', 'translate(0, -36)')
;

var timeAxis = d3.svg.axis()
	.ticks(5)
	.orient('top')
	.tickFormat(timeModule.timeMs2Hhmm)
;

var zoomHandler = d3.behavior.zoom();
axisContainer.call(zoomHandler);

// Panning along x-axis
axisContainer.on('wheel', function (event) {
	var dx = d3.event.wheelDeltaX;
	var dy = d3.event.wheelDeltaY;

	// About 20 milliseconds between events

	if (Math.abs(dy) > Math.abs(dx)) {
		return
	}

	var translation = dx*0.25;

	var r = tScale.range();
	var d = r.map(function (v) {
		return tScale.invert(v - translation);
	});

	tScale.domain(d);

	zoomHandler.x(tScale);
});

zoomHandler.on('zoom', function () {
	// console.log(d3.event.translate);
	updateDisplay();
});



var sortData = function (data) {
	return data.slice().sort(function (a, b) {
		return a.t - b.t;
	});
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

var saveData = function () {
	persistenceModule.saveData({
		data: data,
		activityNames: activityNames,
		autoUpdate: autoUpdate,
		tNow: tNow
	});
};

var loadData = function () {
	var loadedData = persistenceModule.loadData();
	if (loadedData) {
		data = loadedData.data;
		activityNames = loadedData.activityNames;
		autoUpdate = loadedData.autoUpdate;
		tNow = loadedData.tNow;
	}
	updateIScale();
	updateTScale();
};

loadData();

var xFunction = function (d) {
	return tScale(d.t);
};

var yFunction = function (d) {
	return iScale(d.i);
};

var resetChart = function () {
	lineContainer.selectAll('*').remove();
	updateDisplay();
	data = copyData(sortedData);
};

var dragCircle = d3.behavior.drag()
	.on('dragstart', function (d, i) {
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
	})
	.on('drag',	function (d, i) {
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
	})
	.on('dragend', function () {
		// Update the last data point

		// Update the graphics
		updateDisplay();

		data = copyData(sortedData);

		circleContainer
			.selectAll('text')
			.remove()
		;

		if (autoUpdate) {
			activateUpdateDisplayTimer();
		}

		saveData();
	})
;

var toIntervals = function (data) {
	var d = sortData(data);
	d.push({
		t: Math.max(d.last().t, tNow)
	});

	var intervals = [];
	for (var i = 0; i < data.length; i += 1) {
		var di = d[i];
		intervals.push({
			i: di.i,
			c: di.c,
			t1: di.t,
			t2: d[i + 1].t
		});
	}

	return intervals;
};

var updateDisplay = function () {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));
	var intervals = toIntervals(data);

	reportModule.writeReport(intervals, sums, activityNames);

	var now = { t: tNow, i: sortedData.last().i };
	updateNowLine([now]);

	// Sum the time on each activity
	// sums = timeModule.sum(sortedData, activityNames);
	sums = timeModule.sum(intervals, activityNames);

	// Rescale the chart container if necessary
	var height = activityNames.length*hUnit + 36
	svg.attr('height', height);

	// Update timeAxis
	axisContainer.attr('transform', 'translate(0,' + height + ')');
	axisContainer.call(timeAxis);
	timeAxis.ticks(5);

	updateChart(sums, intervals);
	updateActivities(sums);
	setActiveActivity(sortedData.last().i);

	sumsModule.updateDisplay(sums, activityNames);
};

var updateNowLine = function (data) {
	var nowLine = nowLineContainer.selectAll('line').data(data)
	nowLine.exit().remove();
	nowLine
		.enter()
		.append('line')
	;

	nowLine
		.attr('x1', xFunction)
		.attr('x2', xFunction)
		.attr('y1', 0)
		.attr('y2', '100%')
	;
};

var updateChart = function (sums, intervals) {
	// Horizontal lines for each activity
	var lines = lineContainer.selectAll('line').data(sums);
	lines.exit().remove();
	lines
		.enter()
		.append('line')
	;
	lines
		.attr('x1', 0)
		.attr('x2', '100%')
		.attr('y1', yFunction)
		.attr('y2', yFunction)
	;

	updateChartBlocks(intervals);

	// Join the data for the circles
	var circles = circleContainer.selectAll('circle').data(intervals);
	circles.exit().remove();

	// Create elements for new circles and add drag handler
	circles
		.enter()
		.append('circle')
		.call(dragCircle)
	;

	// Update attributes for all updating circles
	circles
		.attr('cx', util.compose(tScale, g('t1')))
		.attr('cy', util.compose(iScale, g('i')))
		.attr('r', r)
	;
};

var updateChartLines = function () {

};

var updateChartBlocks = function (intervals) {
	var height = Math.abs(iScale(1) - iScale(0));
	var halfHeight = height/2;
	rectData = intervals.map(function (d, i) {
		var x1 = tScale(d.t1);
		var x2 = tScale(d.t2);
		var y = iScale(d.i);
		return {
			width: x2-x1,
			y: y,
			x: x1,
			transform: 'translate(' + x1 + ',' + (y - halfHeight) + ')',
			i: i,
			t: d.t1,
			c: d.c,
			clipPathId: 'textClipPath' + i
		};
	});

	var onClick = function (d, i) {
		if (d3.event.shiftKey) {
			data.splice(i, 1);
			resetChart();
			return;
		} else {
			setActiveShift(d)
		}
	};


	// Background rectangles
	var rects = lineContainer.selectAll('rect').data(rectData);
	rects.exit().remove();
	rects
		.enter()
		.append('rect')
		.on('click', onClick)
	;


	rects
		.attr('width', g('width'))
		.attr('height', height)
		.attr('transform', g('transform'))
	;

	// Clip paths
	clipPaths = defs.selectAll('clipPath').data(rectData);
	clipPaths.exit().remove();
	clipPaths
		.enter()
		.append('clipPath')
		.attr('id', g('clipPathId'))
		.append('rect')
	;

	clipRects = defs.selectAll('rect').data(rectData);
	clipRects
		.attr('width', g('width'))
		.attr('height', height)
		.attr('transform', g('transform'))
		.attr('fill', 'black')
	;

	// Text
	var texts = lineContainer.selectAll('text').data(rectData)
	texts.exit().remove();
	texts
		.enter()
		.append('text')
		.on('click', onClick)
	;

	texts
		.attr('x', function (d) { return d.x + 12;	})
		.attr('y', function (d) { return d.y; })
		.text(g('c'))
		.attr('clip-path', function (d) { return 'url(#' + d.clipPathId + ')'; })
	;

};

var setActiveShift = function (d) {
	var textArea = d3.select('#comment-edit')
		.on('input', function () {
			data[d.i].c = this.value;
			saveData();
			updateDisplay();
		})
	;
	textArea.node().value = data[d.i].c || "";
	textArea.node().focus();
};

var updateActivities = function (sums) {

	// Create divs for all activities
	var activities = activitiesList
		.selectAll('.activity')
		.data(sums)
	;
	activities.exit().remove();

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
			updateDisplay();
		})
	;

	newActivities
		.append('div')
		.classed('time', true)
	;

	activitiesList.selectAll('.time')
		.data(sums)
		.text(util.compose(timeModule.durationMsToString, g('t')))
	;


	activities
		.style('height', hUnit + 'px')
		.style('line-height', hUnit/2 + 'px')
	;
};


var onResize = function () {
	var svgWidth = parseInt(svg.style('width'));
	tScale.range([0, svgWidth]);

	fixZoomHandlerOnResize(svgWidth);

	updateDisplay();
};

var fixZoomHandlerOnResize = function (width) {
	// http://stackoverflow.com/questions/25875316/d3-preserve-scale-translate-after-resetting-range
	// Cache scale
	var cacheScale = zoomHandler.scale();

	// Cache translate
	var cacheTranslate = zoomHandler.translate();

	// Cache translate values as percentages/ratio of the full width
	var cacheTranslatePerc = zoomHandler.translate().map(function (v) {
	  return -v/width;
	});

	// Manually reset the zoomHandler
	zoomHandler.scale(1).translate([0, 0]);

	// Apply the tScale to the zoomHandler, (tScale should have been updated prebviously)
	zoomHandler.x(tScale);

	// Revert the scale back to our cached value
	zoomHandler.scale(cacheScale);

	// Overwrite the x value of cacheTranslate based on our cached percentage
	cacheTranslate[0] = -width*cacheTranslatePerc[0];

	// Finally apply the updated translate
	zoomHandler.translate(cacheTranslate);
};

window.onresize = onResize;

// onSubmitActivity is declared in a script element in index.html
onSubmitActivity = function () {
	setTimeout(function () {
		var inputElement = document.getElementById('activity-name-input');
		var activityName = inputElement.value;
		inputElement.value = '';
		inputElement.blur();

		activityNames.push(activityName);
		updateIScale();
		switchToActivity(null, activityNames.length - 1);
	});
	return false;
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

var newDataPoint = function (i, t) {
	data.push({
		i: i,
		t: t || tNow,
		c: "<comment>",
	});

	saveData();
	onResize();
};

svgBackground.on('click', function () {
	if (!d3.event.shiftKey) {
		return;
	}
	var i = Math.round(iScale.invert(d3.event.offsetY));
	var t = tScale.invert(d3.event.offsetX);
	newDataPoint(i, t);
	resetChart();
});

var activateUpdateDisplayTimer = function () {
	updateDisplayTimer = util.setIntervalNow(function () {
		tNow = timeModule.now();
		updateDisplay();
	}, 1000);
};

var deactivateUpdateDisplayTimer = function () {
	clearInterval(updateDisplayTimer);
};

d3.select('#auto-update').on('click', function () {
	autoUpdate = this.checked;
	if (autoUpdate) {
		activateUpdateDisplayTimer();
	} else {
		deactivateUpdateDisplayTimer();
	}
	saveData();
}).node().checked = autoUpdate;

updateTScale();
updateIScale();
if (autoUpdate) {
	activateUpdateDisplayTimer();
}
onResize();
setActiveActivity(data.last().i);