var testData = require('./test-data.js');
var serverInteractions = require('./server-interactions.js');
var time = require('./time');


// Declare variables
var hUnit = 50;
var r = 10;
var wMargin = 4*r;
var finished = false;
var sortedData;
var nCheckboxesPerRow = 5;

var updateDisplayTimer;

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
var sumsActivitiesTable = d3.select('section#sums table#activities');
var checkboxContainer = d3.select('#checkbox-container');

// Create svg
var svg = d3.select('section#chart #left-column #chart-container')
	.append('svg')
	.attr('width', '100%')
;

var lineContainer = svg.append('g');
var pathContainer = svg.append('g');
var circleContainer = svg.append('g');



var sumsRow = sumsActivitiesTable
	.append('tr')
	.attr('id', 'sums')
;

sumsRow
	.append('td')
	.html('Sums')
;

for (var i = 0; i < nCheckboxesPerRow; i++) {
	sumsRow
		.append('td')
		.classed('sum', true)
	;
}





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

var sums;
var updateDisplay = function() {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));

	// Set i of the first circle to that of the last circle
	sortedData[0].i = sortedData[1].i;

	// Sum the time on each activity
	sums = time.sum(sortedData);

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


	// Sums stuff
	// Select all rows with checkboxes
	var sumsActivitiesRows = sumsActivitiesTable
		.selectAll('tr.checkbox-row')
		.data(sums)
	;

	// Add new rows if needed
	var newRows = sumsActivitiesRows
		.enter()
		.append('tr')
		.classed('checkbox-row', true)
	;


	// Add activity name cells
	newRows
		.append('td')
		.classed('activity', true)
	;

	// Add checkbox cells
	newRows
		.each(createCheckboxes)
	;

	// Update text in activities
	sumsActivitiesTable
		.selectAll('.activity')
		.data(sums)
		.html(function(d) {
			return activityNames[d.i] + '<br>' + time.durationMsToString(d.t);
		})
	;

	// Move the sums row to the bottom of the table
	sumsActivitiesTable.node().appendChild(sumsRow.node());


	updateCheckboxSums();
	// printData(sortedData);

	// printData(sums);
};

var createCheckboxes = function() {
	var row = d3.select(this);
	for (var i = 0; i < nCheckboxesPerRow; i++) {
		row
			.append('td')
			.classed('checkbox', true)
			.on('click', function(d,i) {
				toggleCheckbox.bind(this)(d,i);
				updateCheckboxSums.bind(this)(d,i);
			})
		;
	}
};

var toggleCheckbox = function(d, i) {
	var cell = d3.select(this);
	cell.classed('checked', !cell.classed('checked'));
};

var updateCheckboxSums = function() {
	var tTotals = d3.range(nCheckboxesPerRow);
	tTotals = tTotals.map(function() {return 0;});

	sumsActivitiesTable.selectAll('.checkbox-row')
		.each(function(d1, i1) {
			var checkboxes = d3.select(this).selectAll('.checkbox');
			checkboxes
				.each(function(d2, i2) {
					if (d3.select(this).classed('checked'))	{
						tTotals[i2] += d1.t;
					}
				})
			;
		})
	;

	var sumCells = sumsActivitiesTable.selectAll('td.sum');
	sumCells
		.data(tTotals)
		.html(function(d) {
			return time.durationMsToString(d).split(" ").join("<br>");
		})
	;
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

// readDataFromServer();

onResize();
activateUpdateDisplayTimer();