#!/bin/sh

# Create temporary directory (temp)
temp_dir=`mktemp -d 2>/dev/null || mktemp -d -t 'temp_dir'`

# Copy files to be deployed to temp
cp index.html $temp_dir/
cp	-r dist $temp_dir/
find $temp_dir

# Store current branch name
current_branch="$(git rev-parse --abbrev-ref HEAD)"

# Checkout branch gh-pages
git checkout gh-pages

# Copy files to be deployed from temp
rsync -a $temp_dir/* ./

# Add and commit files to be deployed
git add index.html
git add dist/*
git commit -m "Deployed!"

# Push the gh-pages branch
git push origin gh-pages

# Checkout the current branch again
git checkout $current_branch