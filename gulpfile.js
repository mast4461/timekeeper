var gulp 			= require('gulp'),
	browserify 		= require('gulp-browserify'),
	sass  			= require('gulp-ruby-sass'),
	browserSync 	= require('browser-sync'),
	reload 			= browserSync.reload;


//Tasks  regarding scripts--------------------------------------------------|
gulp.task('scripts', function(){
// Single entry point to browserify
       gulp.src('scripts/main.js')
       	.pipe(browserify({
	       	 insertGlobals : true,
	        	debug : !gulp.env.production
        	}))
       	.pipe(gulp.dest('dist'))
});

//Tasks regarding styles----------------------------------------------------|
gulp.task('sass', function(){
	return sass('styles/main.sass')
	.pipe(gulp.dest('dist'))
});

//Live reload--------------------------------------------------------------------|
gulp.task('serve', ['scripts','sass'], function () {

	// Compile if sass or js has changed
	gulp.watch('styles/**/*.sass', ['sass']);
	gulp.watch('scripts/**/*.js', ['scripts']);

	// Reload if new compiled files have been generated or index.html updates
	gulp.watch([
		'dist/**/*',
		'index.html'
	]).on('change', reload);

	browserSync({
		notify: false,
		port: 3600,
		server: {
			routes: {
				'/bower_components': 'bower_components'
			}
		}
	});
});