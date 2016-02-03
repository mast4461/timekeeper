var timeModule = require('./time-module');

var sumsActivitiesTable = d3.select('section#sums table#activities');



var nCheckboxesPerRow = 5;



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



var updateDisplay = function(sums, activityNames) {

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
	sumsActivitiesRows.exit().remove();


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
			return activityNames[d.i] + '<br>' + timeModule.durationMsToString(d.t);
		})
	;

	// Move the sums row to the bottom of the table
	sumsActivitiesTable.node().appendChild(sumsRow.node());


	updateCheckboxSums();
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
			return timeModule.durationMsToString(d).split(" ").join("<br>");
		})
	;
};


exports.updateDisplay = updateDisplay;