import tornado.ioloop
import tornado.web
import json
# import tornado.websocket
import sys

import file_actions


class ApiHandler(tornado.web.RequestHandler):
	def get(self):
		print "ApiHandler get"
		self.set_header('Access-Control-Allow-Origin', '*')
		self.write(file_actions.read())

	def post(self):
		print "ApiHandler post"
		self.set_header('Access-Control-Allow-Origin', '*')
		file_actions.write(self.request.body)
		self.write('')

	def options(self):
		print self.request


class MainHandler(tornado.web.RequestHandler):
	def get(self):
		self.set_header('Access-Control-Allow-Origin', '*')
		self.write("mainhandler get")
		print "mainhandler get"

	# def check_origin(self, origin):
	# 	print "check_origin()"
	# 	return True


application = tornado.web.Application([
	(r"/api/", ApiHandler),
	(r"/.*", MainHandler),
], autoreload=True)

def main():
	print "\nStarting server"

	file_actions.init_file()

	ioloop = tornado.ioloop.IOLoop.instance()

	# Set port if port specified by user
	if(len(sys.argv) > 1):
		port = int(sys.argv[1])
	else:
		port = 8768

	print "Server listening on port %d" % port
	application.listen(port)
	ioloop.start()

if __name__ == "__main__":
	main()