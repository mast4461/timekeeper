# timekeeper
A tool to help keep track of time spent working on different tasks.

## Setup development

- Run `npm install`.
- Run `gulp serve`.
- Update this readme if more steps are needed.

## Data persistence
Data is autosaved in localStorage, if localStorage is available. Data can also be saved to file, or loaded from file.

## ToDo
- Change file export format to more human readable, and with more stats.
- Autosave everything, but only when data actually changes.
- Better tickmarks for time axis. Position tickmarks on more logical timepoints. Include date in tickmarks.
- Tabbed views? E.g. diagram view, list view, sums view.
- Tickmark on time at cursor when hovering over graph.
- Show length of each shift somehow.
- Prevent zooming while panning and panning while zooming when performing these actions by scrolling.