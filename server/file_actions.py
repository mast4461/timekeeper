import time

def write(json_string):
	f = open(get_file_name(), 'w')
	print json_string
	f.write(json_string)
	f.close()

def read():
	f = open(get_file_name(), 'r')
	t = f.read()
	f.close()
	return t

def get_file_name():
	return time.strftime('%Y-%m-%d') + '.txt'

def init_file():
	print "Initializing file"
	f = open(get_file_name(), 'a')
	f.close()
