var testData = require('./test-data.js');
var serverInteractions = require('./server-interactions.js');
var time = require('./time');

// Width and height of chart
var chartContainer = d3.select('#chart-container');
var activityContainer = d3.select('#activity-container');
var checkboxContainer = d3.select('#checkbox-container');


var w = 500;
var hUnit = 50;
var r = 10;
var wMargin = 4*r;
var finished = false;
var sortedData;

var updateDisplayTimer;

var activityNames = ['Default'];


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

			yText =
			svg
				.append('text')
				.attr('text-anchor', 'middle')
				.attr('x', x)
				.attr('y', parseInt(target.attr('cy')) - r)
				.text('' + time.timeMs2Hhmm(t))
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
				.text('' + time.timeMs2Hhmm(t))
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

// Create svg
var svg = chartContainer
	.append('svg')
	.attr('width', '100%')
	.attr('height', '100%')
;

var lineContainer = svg.append('g');
var pathContainer = svg.append('g');
var circleContainer = svg.append('g');


var updateDisplay = function() {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));

	// Set i of the first circle to that of the last circle
	sortedData[0].i = sortedData[1].i;

	// Sum the time on each activity
	var sums = time.sum(sortedData);

	// Rescale the chart container if necessary
	chartContainer
		.style('height', (activityNames.length*hUnit)+'px')
	;

	// Horizontal lines for each activity
	var lines = lineContainer.selectAll('line').data(sums);
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
	var activities = activityContainer
		.selectAll('.activity')
		.data(sums)
	;

	activities
		.enter()
		.append('div')
		.classed('activity', true)
		.classed('block', true)
		.call(switchToActivity)
	;

	activities
		.style('height', hUnit + 'px')
		.style('line-height', hUnit/2 + 'px')
	;


	activities
		.html(function(d) {
			return activityNames[d.i] + '<br>' + time.durationMsToString(d.t);
		})
	;



	// Checkboxes
	var checkboxes = checkboxContainer
		.selectAll('.checkbox')
		.data(sums)
	;

	checkboxes
		.enter()
		.append('div')
		.classed('checkbox', true)
		.append('input')
		.attr('type', 'checkbox')
		.on('change', getCheckBoxesCount)
	;


	// printData(sortedData);

	// printData(sums);
	rescaleSvgToContainer();
};


var getCheckBoxesCount = function() {
	var nChecked = 0;
	var tTotal = 0;
	var checkboxes = checkboxContainer
		.selectAll('.checkbox input')
		.each(function(d) {
			if (this.checked) tTotal += d.t;
		});

	console.log(time.ms2h(tTotal));

	d3.select('#checkbox-sum')
		.html(time.ms2h(tTotal));
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

var switchToActivity = d3.behavior.drag()
	.on('dragstart', function(d, i) {
		newDataPoint(i);
	})
;

var newDataPoint = function(i) {
	data.push({
		i: i,
		t: time.now()
	});
	onResize();
};

var updateLastTime = function(data) {
	if (!finished) {
		data[data.length-1].t = time.now();
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

readDataFromServer();

onResize();
rescaleSvgToContainer();
activateUpdateDisplayTimer();