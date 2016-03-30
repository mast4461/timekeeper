# timekeeper
A tool to help keep track of time spent working on different tasks.

## Setup development

- Run `npm install`.
- Run `gulp serve`.
- Update this readme if more steps are needed.

## Data persistence
Data is autosaved in localStorage, if localStorage is available. Data can also be saved to file, or loaded from file.

## ToDo
- FIX BUILD SYSTEM!!!!
- Change file export format to more human readable, and with more stats.
- Autosave everything, but only when data actually changes.
- Tabbed views? E.g. diagram view, list view, sums view.
- Tickmark on time at cursor when hovering over graph.
- Show length of each shift somehow.
- Prevent zooming while panning and panning while zooming when performing these actions by scrolling.
- Button for fitting scale/translate to data.
- Save current scale/translate with other data.
- Fix graphical bug where lines end up on top of session-blocks. !!!!!!!!!
- Use UIDs for sessions and activities for referencing, instead of array indices? Would solve problem with sorting while dragging.
- Activities list reorderable by user. Activities list sortable by criteria (e.g. by time spent, name. Order also reversible)
- Individual, editable, colors for activities, with defaults chosen from some colormap.
- Bar chart or other diagram showing which fractions of the total time was spent on the different tasks.
- Fix bug where domain for time scale jumps if first dragging, then moving mouse, then panning.
- Draggable nowline.
- Activities should be deletable. With warning if there are sessions associated with the activity.
- Better editing of session comments.
- Make sure page widht doesn't exceed 100%.
- In the time report, for sessions on the same activity: sum those that have the same comment.
- Make application usable over https (at the moment d3 is loaded over http, not https)