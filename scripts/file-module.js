// Credit to https://thiscouldbebetter.wordpress.com/2012/12/18/loading-editing-and-saving-a-text-file-in-html5-using-javascrip/

var save = function(data, fileName) {
	var textFileAsBlob = new Blob(
		[JSON.stringify(data, null, 2)],
		{type:'application/json'}
	);

	var fileName = fileName || "timekeeper " + (new Date()).toString();

	var downloadLink = document.createElement("a");
	downloadLink.download = fileName;
	downloadLink.innerHTML = "Download File";

	downloadLink.href = URL.createObjectURL(textFileAsBlob);

	downloadLink.click();
};

var load = function() {
	return new Promise(function(resolve) {
		var fileToLoad = document.querySelector("section#menu #load").files[0];

		// Create filereader
		var fileReader = new FileReader();

		// Add onload function to filereader
		fileReader.onload = function(fileLoadedEvent) {
			var obj = JSON.parse(fileLoadedEvent.target.result);
			resolve(obj);
		};

		// Make filereader read file
		fileReader.readAsText(fileToLoad, "UTF-8");
	});
};

exports.save = save;
exports.load = load;