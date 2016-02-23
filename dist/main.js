(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/index.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer")
},{"1YiZ5S":4,"base64-js":2,"buffer":1,"ieee754":3}],2:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib/b64.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib")
},{"1YiZ5S":4,"buffer":1}],3:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754/index.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754")
},{"1YiZ5S":4,"buffer":1}],4:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/process/browser.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/process")
},{"1YiZ5S":4,"buffer":1}],5:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var testData = require('./test-data');
var serverInteractions = require('./server-interactions');
var timeModule = require('./time-module');
var sumsModule = require('./sums-module');
var fileModule = require('./file-module');
var persistenceModule = require('./persistence-module');
var reportModule = require('./report-module');
var util = require('./util');


// Declare variables
var hUnit = 50;
var r = 10;
var sortedData;

var updateDisplayTimer;
var tNow = timeModule.now();
var autoUpdate = true;


var g = function (key) {
	return function(obj) {
		return obj[key];
	};
};

gt = g('t');
gi = g('i');

// Add button listeners
d3.select('section#menu #save')
	.on('click', function () {
		var tStart = data[0].t;
		var fileName = "timekeeper " + (new Date(tStart).toDateString());
		fileModule.save({
			data: data,
			activityNames: activityNames
		}, fileName);
	})
;

d3.select('section#menu #load')
	.on('change', function () {
		fileModule.load().then(function (loadedData) {
			activitiesList.selectAll('*').remove();
			data = loadedData.data;
			activityNames = loadedData.activityNames;
			updateIScale();
			updateTScale();
		});
	})
;

var loadTestData = function (i) {
	var temp = testData.get(i);
	data = temp.data;
	activityNames = temp.activityNames;
	lastLoaded = temp;
};

d3.select('section#menu #clear')
	.on('click', function () {
		var confirmed = confirm("Clear current data?");
		if (confirmed) {
			loadTestData(0);
			saveData();
			updateTScale();
			updateDisplay();
		}
	})
;

// Get testdata
var activityNames = ['Default'];
var data;
loadTestData(0);

// Select objects
var activitiesList = d3.select('section#chart #right-column ul.activities');

// Create svg
var svg = d3.select('section#chart #left-column #chart-container')
	.append('svg')
	.attr('width', '100%')
;

var svgBackground = svg.append('rect')
	.attr('width', '100%')
	.attr('height', '100%')
	.attr('fill', 'rgba(0,0,0,0)')
	.attr('id', 'svg-background')
;
var defs = svg.append('defs');
var lineContainer = svg.append('g').attr('id', 'line-container');
var pathContainer = svg.append('g').attr('id', 'path-container');
var circleContainer = svg.append('g').attr('id', 'circle-container');
var nowLineContainer = svg.append('g').attr('id', 'now-line-container');
var axisContainer = svg.append('g').attr('id', 'axis-container');
axisContainer
	.append('rect')
	.attr('width', '100%')
	.attr('height', '36')
	.attr('transform', 'translate(0, -36)')
;

var timeAxis = d3.svg.axis()
	// .ticks(5)
	.orient('top')
	// .tickFormat(timeModule.timeMs2Hhmm)
;

var zoomHandler = d3.behavior.zoom();
axisContainer.call(zoomHandler);

// Panning along x-axis
axisContainer.on('wheel', function (event) {
	var dx = d3.event.wheelDeltaX;
	var dy = d3.event.wheelDeltaY;

	// About 20 milliseconds between events

	if (Math.abs(dy) > Math.abs(dx)) {
		return
	}

	var translation = dx*0.25;

	var r = tScale.range();
	var d = r.map(function (v) {
		return tScale.invert(v - translation);
	});

	tScale.domain(d);

	zoomHandler.x(tScale);
});

zoomHandler.on('zoom', function () {
	updateDScale();
	updateDisplay();
});


var getSvgWidth = function () {
	return parseInt(svg.style('width'));
};

var getLatestTime = function () {
	return Math.max(data.last().t, tNow);
};

var sortData = function (data) {
	return data.slice().sort(function (a, b) {
		return a.t - b.t;
	});
};

var copyData = function (data) {
	return data.slice(0);
};

var printData = function (data) {
	var str = "";
	data.forEach(function (item){
		str += "\nt: " + item.t + " i: " + item.i;
	});
};

var durationMin = 5*60*1000;

var tScale = d3.scale.linear();
var iScale = d3.scale.linear();
var dScale = d3.time.scale();


var updateTScale = function () {
	updateTScaleRange();
	updateTScaleDomain();

	zoomHandler.x(tScale);

	updateDScale();
};

var updateTScaleRange = function () {
	tScale.range([0, getSvgWidth()]);
};

var updateTScaleDomain = function () {
	var tDomain = [data[0].t, getLatestTime()];

	if (tDomain[1] - tDomain[0] < durationMin) {
		tDomain[1] = tDomain[0] + durationMin;
	};

	var tMargin = (tDomain[1]-tDomain[0])*0.05;
	tDomain[0] -= tMargin;
	tDomain[1] += tMargin;

	tScale.domain(tDomain);
};

var updateDScale = function () {
	var tDomain = tScale.domain();
	dScale
		.domain([new Date(tDomain[0]), new Date(tDomain[1])])
		.range(tScale.range())
	;

	timeAxis.scale(dScale);
};

var updateIScale = function () {
	var iDomain = [0, activityNames.length-1];
	var iRange = [hUnit*0.5,(iDomain[1]-iDomain[0]+0.5)*hUnit];
	iScale
		.domain(iDomain)
		.rangeRound(iRange)
		.clamp(true)
	;
};

var saveData = function () {
	persistenceModule.saveData({
		data: data,
		activityNames: activityNames,
		autoUpdate: autoUpdate,
		tNow: tNow
	});
};

var loadData = function () {
	var loadedData = persistenceModule.loadData();
	if (loadedData) {
		data = loadedData.data;
		activityNames = loadedData.activityNames;
		autoUpdate = loadedData.autoUpdate;

		if (autoUpdate) {
			tNow = Date.now();
		} else {
			tNow = loadedData.tNow;
		}
	}
	updateIScale();
	updateTScale();
};

loadData();

var xFunction = function (d) {
	return tScale(d.t);
};

var yFunction = function (d) {
	return iScale(d.i);
};

var resetChart = function () {
	lineContainer.selectAll('*').remove();
	updateDisplay();
	data = copyData(sortedData);
};

var dragCircle = d3.behavior.drag()
	.on('dragstart', function (d, i) {
		deactivateUpdateDisplayTimer();

		var target = d3.select(this);
		var x = target.attr('cx');
		var t = tScale.invert(x);

		circleContainer
			.append('text')
			.attr('text-anchor', 'middle')
			.attr('x', x)
			.attr('y', parseInt(target.attr('cy')) - r)
			.text('' + timeModule.timeMs2Hhmm(t))
		;
	})
	.on('drag',	function (d, i) {
		var target = d3.select(this);

		var x = d3.event.x;
		var y = d3.event.y;
		// target.attr('cy', y);

		var t = tScale.invert(x);
		var iNew = Math.round(iScale.invert(y));
		data[i].t = t;
		data[i].i = iNew;

		target.attr('cx', x);
		target.attr('cy', y);

		circleContainer
			.select('text')
			.attr('x', x)
			.attr('y', iScale(iNew) - r)
			.text('' + timeModule.timeMs2Hhmm(t))
		;

		updateDisplay();
	})
	.on('dragend', function () {
		// Update the last data point

		// Update the graphics
		updateDisplay();

		data = copyData(sortedData);

		circleContainer
			.selectAll('text')
			.remove()
		;

		if (autoUpdate) {
			activateUpdateDisplayTimer();
		}

		saveData();
	})
;

var toIntervals = function (data) {
	var d = sortData(data);
	d.push({
		t: getLatestTime()
	});

	var intervals = [];
	for (var i = 0; i < data.length; i += 1) {
		var di = d[i];
		intervals.push({
			i: di.i,
			c: di.c,
			t1: di.t,
			t2: d[i + 1].t
		});
	}

	return intervals;
};

var updateDisplay = function () {
	// Copy the data and sort it
	sortedData = sortData(copyData(data));
	var intervals = toIntervals(data);

	reportModule.writeReport(intervals, sums, activityNames);

	var now = { t: tNow, i: sortedData.last().i };
	updateNowLine([now]);

	// Sum the time on each activity
	// sums = timeModule.sum(sortedData, activityNames);
	sums = timeModule.sum(intervals, activityNames);

	// Rescale the chart container if necessary
	var height = activityNames.length*hUnit + 36
	svg.attr('height', height);

	// Update timeAxis
	axisContainer.attr('transform', 'translate(0,' + height + ')');
	axisContainer.call(timeAxis);

	timeAxis.ticks(Math.round(getSvgWidth()/95));

	updateChart(sums, intervals);
	updateActivities(sums);
	setActiveActivity(sortedData.last().i);

	sumsModule.updateDisplay(sums, activityNames);
};

var updateNowLine = function (data) {
	var nowLine = nowLineContainer.selectAll('line').data(data)
	nowLine.exit().remove();
	nowLine
		.enter()
		.append('line')
	;

	nowLine
		.attr('x1', xFunction)
		.attr('x2', xFunction)
		.attr('y1', 0)
		.attr('y2', '100%')
	;
};

var updateChart = function (sums, intervals) {
	// Horizontal lines for each activity
	var lines = lineContainer.selectAll('line').data(sums);
	lines.exit().remove();
	lines
		.enter()
		.append('line')
	;
	lines
		.attr('x1', 0)
		.attr('x2', '100%')
		.attr('y1', yFunction)
		.attr('y2', yFunction)
	;

	updateChartBlocks(intervals);

	// Join the data for the circles
	var circles = circleContainer.selectAll('circle').data(intervals);
	circles.exit().remove();

	// Create elements for new circles and add drag handler
	circles
		.enter()
		.append('circle')
		.call(dragCircle)
	;

	// Update attributes for all updating circles
	circles
		.attr('cx', util.compose(tScale, g('t1')))
		.attr('cy', util.compose(iScale, gi))
		.attr('r', r)
	;
};

var updateChartLines = function () {

};

var updateChartBlocks = function (intervals) {
	rectData = intervals.map(function (d, i) {
		var x1 = tScale(d.t1);
		var x2 = tScale(d.t2);
		var y = iScale(d.i);
		return {
			width: x2-x1,
			y: y,
			x: x1,
			transform: 'translate(' + x1 + ',' + (y - hUnit/2) + ')',
			i: i,
			t: d.t1,
			c: d.c,
			clipPathId: 'textClipPath' + i
		};
	});

	var onClick = function (d, i) {
		if (d3.event.shiftKey) {
			data.splice(i, 1);
			resetChart();
			return;
		} else {
			setActiveShift(d)
		}
	};


	// Background rectangles
	var rects = lineContainer.selectAll('rect').data(rectData);
	rects.exit().remove();
	rects
		.enter()
		.append('rect')
		.on('click', onClick)
	;


	rects
		.attr('width', g('width'))
		.attr('height', hUnit)
		.attr('transform', g('transform'))
	;

	// Clip paths
	clipPaths = defs.selectAll('clipPath').data(rectData);
	clipPaths.exit().remove();
	clipPaths
		.enter()
		.append('clipPath')
		.attr('id', g('clipPathId'))
		.append('rect')
	;

	clipRects = defs.selectAll('rect').data(rectData);
	clipRects
		.attr('width', g('width'))
		.attr('height', hUnit)
		.attr('transform', g('transform'))
		.attr('fill', 'black')
	;

	// Text
	var texts = lineContainer.selectAll('text').data(rectData)
	texts.exit().remove();
	texts
		.enter()
		.append('text')
		.on('click', onClick)
	;

	texts
		.attr('x', function (d) { return d.x + 12;	})
		.attr('y', function (d) { return d.y; })
		.text(g('c'))
		.attr('clip-path', function (d) { return 'url(#' + d.clipPathId + ')'; })
	;

};

var setActiveShift = function (d) {
	var textArea = d3.select('#comment-edit')
		.on('input', function () {
			data[d.i].c = this.value;
			saveData();
			updateDisplay();
		})
	;
	textArea.node().value = data[d.i].c || "";
	textArea.node().focus();
};

var updateActivities = function (sums) {

	// Create divs for all activities
	var activities = activitiesList
		.selectAll('.activity')
		.data(sums)
	;
	activities.exit().remove();

	var newActivities = activities
		.enter()
		.append('li')
		.classed('activity', true)
		.classed('block', true)
	;

	newActivities
		.append('div')
		.classed('switch', true)
		.text('>')
		.on('click', switchToActivity)
	;

	newActivities
		.append('input')
		.attr('type', 'text')
		.attr('value', function (d) {
			return activityNames[d.i];
		})
		.on('input', function (d, i) {
			activityNames[i] = this.value;
			updateDisplay();
		})
	;

	newActivities
		.append('div')
		.classed('time', true)
	;

	activitiesList.selectAll('.time')
		.data(sums)
		.text(util.compose(timeModule.durationMsToString, gt))
	;


	activities
		.style('height', hUnit + 'px')
		.style('line-height', hUnit/2 + 'px')
	;
};

var onResize = function () {
	var svgWidth = parseInt(svg.style('width'));

	var tRange = [0, getSvgWidth()];
	tScale.range(tRange);
	dScale.range(tRange);

	fixZoomHandlerOnResize(svgWidth);

	updateDisplay();
};

var fixZoomHandlerOnResize = function (width) {
	// http://stackoverflow.com/questions/25875316/d3-preserve-scale-translate-after-resetting-range
	// Cache scale
	var cacheScale = zoomHandler.scale();

	// Cache translate
	var cacheTranslate = zoomHandler.translate();

	// Cache translate values as percentages/ratio of the full width
	var cacheTranslatePerc = zoomHandler.translate().map(function (v) {
	  return -v/width;
	});

	// Manually reset the zoomHandler
	zoomHandler.scale(1).translate([0, 0]);

	// Apply the tScale to the zoomHandler, (tScale should have been updated prebviously)
	zoomHandler.x(tScale);

	// Revert the scale back to our cached value
	zoomHandler.scale(cacheScale);

	// Overwrite the x value of cacheTranslate based on our cached percentage
	cacheTranslate[0] = -width*cacheTranslatePerc[0];

	// Finally apply the updated translate
	zoomHandler.translate(cacheTranslate);
};

window.onresize = onResize;

// onSubmitActivity is declared in a script element in index.html
onSubmitActivity = function () {
	setTimeout(function () {
		var inputElement = document.getElementById('activity-name-input');
		var activityName = inputElement.value;
		inputElement.value = '';
		inputElement.blur();

		activityNames.push(activityName);
		updateIScale();
		switchToActivity(null, activityNames.length - 1);
	});
	return false;
};

var switchToActivity = function (d, i) {
	newDataPoint(i);
	setActiveActivity(i);
};

var setActiveActivity = function (i) {
	var switches = activitiesList.selectAll('.switch')
		.classed('active', false);
	d3.select(switches[0][i]).classed('active', true);
};

var newDataPoint = function (i, t) {
	data.push({
		i: i,
		t: t || tNow,
		c: "<comment>",
	});

	saveData();
	onResize();
};

svgBackground.on('click', function () {
	if (!d3.event.shiftKey) {
		return;
	}
	var i = Math.round(iScale.invert(d3.event.offsetY));
	var t = tScale.invert(d3.event.offsetX);
	newDataPoint(i, t);
	resetChart();
});

var activateUpdateDisplayTimer = function () {
	updateDisplayTimer = util.setIntervalNow(function () {
		tNow = timeModule.now();
		updateDisplay();
	}, 1000);
};

var deactivateUpdateDisplayTimer = function () {
	clearInterval(updateDisplayTimer);
};

d3.select('#auto-update').on('click', function () {
	autoUpdate = this.checked;
	if (autoUpdate) {
		activateUpdateDisplayTimer();
	} else {
		deactivateUpdateDisplayTimer();
	}
	saveData();
}).node().checked = autoUpdate;

updateTScale();
updateIScale();
if (autoUpdate) {
	activateUpdateDisplayTimer();
}
onResize();
setActiveActivity(data.last().i);
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_b2455b82.js","/")
},{"./file-module":6,"./persistence-module":7,"./report-module":8,"./server-interactions":9,"./sums-module":10,"./test-data":11,"./time-module":12,"./util":13,"1YiZ5S":4,"buffer":1}],6:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
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
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/file-module.js","/")
},{"1YiZ5S":4,"buffer":1}],7:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var storage = window.localStorage;
try {
	var x = '__storage_test__';
	storage[x] = x;
	delete storage[x];
	var key = 'timekeeper-data';
} catch(e) {
	alert("Warning: localStorage not available. Your data will not be autosaved." + e);
	console.log(e);
	storage = null;
}

var saveData = function (data) {
	if (storage) {
		storage[key] = JSON.stringify(data);
	}
};

var loadData = function () {
	if (storage && storage.hasOwnProperty(key)) {
		return JSON.parse(storage[key]);
	}
};

exports.saveData = saveData;
exports.loadData = loadData;
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/persistence-module.js","/")
},{"1YiZ5S":4,"buffer":1}],8:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var timeModule = require('./time-module');

var writeReport = function (intervals, sums, activityNames) {
	try {
		var nl = "\r\n";
		var tab = "\t";
		var tabtab = "\t\t";
		var sep = " | "

		var activities = activityNames.map(function (activityName, i) {
			var activity = activityName + sep + timeModule.durationMsToString(sums[i].t) + nl;

			sessions = intervals.filter(function (session) {
				return session.i === i;
			}).forEach(function (session) {
				activity += tab + timeModule.timeMs2Hhmm(session.t1)
					+ "-" + timeModule.timeMs2Hhmm(session.t2)
					+ sep + timeModule.durationMsToString(session.t2 - session.t1) + nl;

				activity += tabtab + session.c + nl;
			});

			return activity;
		});
		d3.select('#report').node().innerHTML = activities.join(nl);
	} catch (e) {
		console.error(e);
	}
};

exports.writeReport = writeReport;
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/report-module.js","/")
},{"./time-module":12,"1YiZ5S":4,"buffer":1}],9:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var url = 'http://localhost:8768/api/';

// From http://www.html5rocks.com/en/tutorials/cors/
var createCORSRequest = function(method, url) {
	var xhr = new XMLHttpRequest();
	if ("withCredentials" in xhr) {

		// Check if the XMLHttpRequest object has a "withCredentials" property.
		// "withCredentials" only exists on XMLHTTPRequest2 objects.
		xhr.open(method, url, true);

	} else if (typeof XDomainRequest != "undefined") {

		// Otherwise, check if XDomainRequest.
		// XDomainRequest only exists in IE, and is IE's way of making CORS requests.
		xhr = new XDomainRequest();
		xhr.open(method, url);

	} else {

		// Otherwise, CORS is not supported by the browser.
		xhr = null;

	}
	if (!xhr) {
		throw new Error('CORS not supported');
	} else {
		return xhr;
	}
}


// All data has to be written and read, including activity names and comments
exports.write = function(data) {
	var xhr = createCORSRequest('POST', url);
	xhr.send(JSON.stringify(data));
};

exports.read = function(callback) {
	var xhr = createCORSRequest('GET', url);
	xhr.onload = function() {
		var obj = JSON.parse(xhr.responseText);
		console.log("Server read");
		console.log(obj);
		callback(obj);
	}
	xhr.send();
};


}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/server-interactions.js","/")
},{"1YiZ5S":4,"buffer":1}],10:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
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
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/sums-module.js","/")
},{"./time-module":12,"1YiZ5S":4,"buffer":1}],11:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var timeModule = require('./time-module');

var c = "<comment>";

data = [];

data.push([
	{t: timeModule.now(), i: 0, c: c},
]);


data.push([
	{t: 1430980332837, i: 2, c: c},
	{t: 1430981360434, i: 2, c: c},
	{t: 1430989300956, i: 1, c: c},
	{t: 1430992944254, i: 0, c: c},
	{t: 1430995933627, i: 3, c: c},
	{t: 1431003540000, i: 0, c: c},
	{t: 1431004808329, i: 2, c: c},
	{t: 1431010600239, i: 1, c: c},
]);

data.push([
	{t: 1431368923534, i: 0, c: c},
	{t: 1431368929534, i: 0, c: c},
]);

data.push([
	{t:  1000, i: 0, c: c},
	{t:  9000, i: 0, c: c},
	{t: 20000, i: 1, c: c},
	{t: 49000, i: 2, c: c},
	{t: 54000, i: 0, c: c},
]);

var processData = function(data) {
	var t = timeModule.now();
	var tLast = data[data.length-1].t;
	return data.map(function(item) {
		item.t += t - tLast;
		return item;
	});
}

var generateNames = function(data) {
	var iAll = {};
	data.forEach(function(item) {
		if (!(item.i in iAll)) iAll[item.i] = 0;
	})
	var names = Object.keys(iAll).map(function(item, index) {
		return "Activity" + index;
	});
	return names;
};

var get = function(n) {
	if (n === undefined) n = 0;

	return {
		data: processData(data[n]),
		activityNames: generateNames(data[n])
	}
};


exports.get = get;
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/test-data.js","/")
},{"./time-module":12,"1YiZ5S":4,"buffer":1}],12:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var now = function() {
	return (new Date()).getTime();
};

var sum = function (intervals, activityNames) {
	var sums = activityNames.map(function () { return 0; });
	intervals.forEach(function (interval) {
		sums[interval.i] += interval.t2 - interval.t1;
	});

	// Return array of indices and durations
	return sums.map(function (sum, i) {
		return { i: i, t: sum };
	});
};

// milliseconds to hours
var ms2h = function(ms) {
	return ms/3600000;
};

var durationMsToString = function(ms) {
	return ms2hq(ms) + ' (' + ms2h(ms).toFixed(4) + ') h'
};

// milliseconds to hours rounded to nearest quarter
var ms2hq = function(ms) {
	return quantize(ms2h(ms), 0.25).toFixed(2);
};

// round hours to nearest quarter hour
var quantize = function(number, quanta) {
	return Math.round(number/quanta)*quanta;
};

var timeMs2Hhmm = function(ms) {
	var date = new Date(ms);
	return date.toTimeString().slice(0,5);
};

exports.sum = sum;
exports.now = now;
exports.ms2h = ms2h;
exports.timeMs2Hhmm = timeMs2Hhmm;
exports.durationMsToString = durationMsToString;
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/time-module.js","/")
},{"1YiZ5S":4,"buffer":1}],13:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
Array.prototype.last = function() {
	return this[this.length - 1];
};

exports.compose = function (func1, func2) {
	return function() {
		return func1(func2.apply(null, arguments));
	};
};

exports.clamp = function (x, a, b) {
	a = a || -Infinity;
	b = b || Infinity;

	console.log(x,a,b);
	return Math.min(Math.max(a,x),b);
};

exports.setIntervalNow = function (func) {
	var argsForFunc = [].slice.call(arguments).slice(2);
	func.apply(null, argsForFunc);
	return setInterval.apply(null, arguments);
};
}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/util.js","/")
},{"1YiZ5S":4,"buffer":1}]},{},[5])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYXJ0aW4vZGV2L21hcnRpbi90aW1la2VlcGVyL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9tYXJ0aW4vZGV2L21hcnRpbi90aW1la2VlcGVyL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qcyIsIi9Vc2Vycy9tYXJ0aW4vZGV2L21hcnRpbi90aW1la2VlcGVyL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9zY3JpcHRzL2Zha2VfYjI0NTViODIuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9zY3JpcHRzL2ZpbGUtbW9kdWxlLmpzIiwiL1VzZXJzL21hcnRpbi9kZXYvbWFydGluL3RpbWVrZWVwZXIvc2NyaXB0cy9wZXJzaXN0ZW5jZS1tb2R1bGUuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9zY3JpcHRzL3JlcG9ydC1tb2R1bGUuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9zY3JpcHRzL3NlcnZlci1pbnRlcmFjdGlvbnMuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9zY3JpcHRzL3N1bXMtbW9kdWxlLmpzIiwiL1VzZXJzL21hcnRpbi9kZXYvbWFydGluL3RpbWVrZWVwZXIvc2NyaXB0cy90ZXN0LWRhdGEuanMiLCIvVXNlcnMvbWFydGluL2Rldi9tYXJ0aW4vdGltZWtlZXBlci9zY3JpcHRzL3RpbWUtbW9kdWxlLmpzIiwiL1VzZXJzL21hcnRpbi9kZXYvbWFydGluL3RpbWVrZWVwZXIvc2NyaXB0cy91dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2bENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTJcblxuLyoqXG4gKiBJZiBgQnVmZmVyLl91c2VUeXBlZEFycmF5c2A6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChjb21wYXRpYmxlIGRvd24gdG8gSUU2KVxuICovXG5CdWZmZXIuX3VzZVR5cGVkQXJyYXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKywgRmlyZWZveCA0KyxcbiAgLy8gQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLiBJZiB0aGUgYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGFkZGluZ1xuICAvLyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0XG4gIC8vIGJlY2F1c2Ugd2UgbmVlZCB0byBiZSBhYmxlIHRvIGFkZCBhbGwgdGhlIG5vZGUgQnVmZmVyIEFQSSBtZXRob2RzLiBUaGlzIGlzIGFuIGlzc3VlXG4gIC8vIGluIEZpcmVmb3ggNC0yOS4gTm93IGZpeGVkOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gYXNzdW1lIHRoYXQgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgbmVlZHMgdG8gYmUgYSBudW1iZXIsIGFycmF5IG9yIHN0cmluZy4nKVxuXG4gIHZhciBidWZcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYnVmID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwIHx8ICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICB9IGVsc2Uge1xuICAgIHRhcmdldC5fc2V0KHRoaXMuc3ViYXJyYXkoc3RhcnQsIHN0YXJ0ICsgbGVuKSwgdGFyZ2V0X3N0YXJ0KVxuICB9XG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2krMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gY2xhbXAoc3RhcnQsIGxlbiwgMClcbiAgZW5kID0gY2xhbXAoZW5kLCBsZW4sIGxlbilcblxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIHJldHVybiBCdWZmZXIuX2F1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKVxuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBhc2NpaVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBOb2RlJ3MgY29kZSBzZWVtcyB0byBiZSBkb2luZyB0aGlzIGFuZCBub3QgJiAweDdGLi5cbiAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSAmIDB4RkYpXG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiB1dGYxNmxlVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgYyA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaGkgPSBjID4+IDhcbiAgICBsbyA9IGMgJSAyNTZcbiAgICBieXRlQXJyYXkucHVzaChsbylcbiAgICBieXRlQXJyYXkucHVzaChoaSlcbiAgfVxuXG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPj0gMCwgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL2luZGV4LmpzXCIsXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVNfVVJMX1NBRkUgPSAnLScuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0hfVVJMX1NBRkUgPSAnXycuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTIHx8XG5cdFx0ICAgIGNvZGUgPT09IFBMVVNfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIIHx8XG5cdFx0ICAgIGNvZGUgPT09IFNMQVNIX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qc1wiLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uIChidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV1cblxuICBpICs9IGRcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKVxuICBzID4+PSAoLW5CaXRzKVxuICBuQml0cyArPSBlTGVuXG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpIHt9XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSlcbiAgZSA+Pj0gKC1uQml0cylcbiAgbkJpdHMgKz0gbUxlblxuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KSB7fVxuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhc1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSlcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pXG4gICAgZSA9IGUgLSBlQmlhc1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pXG59XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbiAoYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwXG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSlcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMFxuICAgIGUgPSBlTWF4XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpXG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tXG4gICAgICBjICo9IDJcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGNcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpXG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrXG4gICAgICBjIC89IDJcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwXG4gICAgICBlID0gZU1heFxuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKVxuICAgICAgZSA9IGUgKyBlQmlhc1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbilcbiAgICAgIGUgPSAwXG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCkge31cblxuICBlID0gKGUgPDwgbUxlbikgfCBtXG4gIGVMZW4gKz0gbUxlblxuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpIHt9XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4XG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzXCIsXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0XCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIsXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB0ZXN0RGF0YSA9IHJlcXVpcmUoJy4vdGVzdC1kYXRhJyk7XG52YXIgc2VydmVySW50ZXJhY3Rpb25zID0gcmVxdWlyZSgnLi9zZXJ2ZXItaW50ZXJhY3Rpb25zJyk7XG52YXIgdGltZU1vZHVsZSA9IHJlcXVpcmUoJy4vdGltZS1tb2R1bGUnKTtcbnZhciBzdW1zTW9kdWxlID0gcmVxdWlyZSgnLi9zdW1zLW1vZHVsZScpO1xudmFyIGZpbGVNb2R1bGUgPSByZXF1aXJlKCcuL2ZpbGUtbW9kdWxlJyk7XG52YXIgcGVyc2lzdGVuY2VNb2R1bGUgPSByZXF1aXJlKCcuL3BlcnNpc3RlbmNlLW1vZHVsZScpO1xudmFyIHJlcG9ydE1vZHVsZSA9IHJlcXVpcmUoJy4vcmVwb3J0LW1vZHVsZScpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcblxuXG4vLyBEZWNsYXJlIHZhcmlhYmxlc1xudmFyIGhVbml0ID0gNTA7XG52YXIgciA9IDEwO1xudmFyIHNvcnRlZERhdGE7XG5cbnZhciB1cGRhdGVEaXNwbGF5VGltZXI7XG52YXIgdE5vdyA9IHRpbWVNb2R1bGUubm93KCk7XG52YXIgYXV0b1VwZGF0ZSA9IHRydWU7XG5cblxudmFyIGcgPSBmdW5jdGlvbiAoa2V5KSB7XG5cdHJldHVybiBmdW5jdGlvbihvYmopIHtcblx0XHRyZXR1cm4gb2JqW2tleV07XG5cdH07XG59O1xuXG5ndCA9IGcoJ3QnKTtcbmdpID0gZygnaScpO1xuXG4vLyBBZGQgYnV0dG9uIGxpc3RlbmVyc1xuZDMuc2VsZWN0KCdzZWN0aW9uI21lbnUgI3NhdmUnKVxuXHQub24oJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuXHRcdHZhciB0U3RhcnQgPSBkYXRhWzBdLnQ7XG5cdFx0dmFyIGZpbGVOYW1lID0gXCJ0aW1la2VlcGVyIFwiICsgKG5ldyBEYXRlKHRTdGFydCkudG9EYXRlU3RyaW5nKCkpO1xuXHRcdGZpbGVNb2R1bGUuc2F2ZSh7XG5cdFx0XHRkYXRhOiBkYXRhLFxuXHRcdFx0YWN0aXZpdHlOYW1lczogYWN0aXZpdHlOYW1lc1xuXHRcdH0sIGZpbGVOYW1lKTtcblx0fSlcbjtcblxuZDMuc2VsZWN0KCdzZWN0aW9uI21lbnUgI2xvYWQnKVxuXHQub24oJ2NoYW5nZScsIGZ1bmN0aW9uICgpIHtcblx0XHRmaWxlTW9kdWxlLmxvYWQoKS50aGVuKGZ1bmN0aW9uIChsb2FkZWREYXRhKSB7XG5cdFx0XHRhY3Rpdml0aWVzTGlzdC5zZWxlY3RBbGwoJyonKS5yZW1vdmUoKTtcblx0XHRcdGRhdGEgPSBsb2FkZWREYXRhLmRhdGE7XG5cdFx0XHRhY3Rpdml0eU5hbWVzID0gbG9hZGVkRGF0YS5hY3Rpdml0eU5hbWVzO1xuXHRcdFx0dXBkYXRlSVNjYWxlKCk7XG5cdFx0XHR1cGRhdGVUU2NhbGUoKTtcblx0XHR9KTtcblx0fSlcbjtcblxudmFyIGxvYWRUZXN0RGF0YSA9IGZ1bmN0aW9uIChpKSB7XG5cdHZhciB0ZW1wID0gdGVzdERhdGEuZ2V0KGkpO1xuXHRkYXRhID0gdGVtcC5kYXRhO1xuXHRhY3Rpdml0eU5hbWVzID0gdGVtcC5hY3Rpdml0eU5hbWVzO1xuXHRsYXN0TG9hZGVkID0gdGVtcDtcbn07XG5cbmQzLnNlbGVjdCgnc2VjdGlvbiNtZW51ICNjbGVhcicpXG5cdC5vbignY2xpY2snLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGNvbmZpcm1lZCA9IGNvbmZpcm0oXCJDbGVhciBjdXJyZW50IGRhdGE/XCIpO1xuXHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdGxvYWRUZXN0RGF0YSgwKTtcblx0XHRcdHNhdmVEYXRhKCk7XG5cdFx0XHR1cGRhdGVUU2NhbGUoKTtcblx0XHRcdHVwZGF0ZURpc3BsYXkoKTtcblx0XHR9XG5cdH0pXG47XG5cbi8vIEdldCB0ZXN0ZGF0YVxudmFyIGFjdGl2aXR5TmFtZXMgPSBbJ0RlZmF1bHQnXTtcbnZhciBkYXRhO1xubG9hZFRlc3REYXRhKDApO1xuXG4vLyBTZWxlY3Qgb2JqZWN0c1xudmFyIGFjdGl2aXRpZXNMaXN0ID0gZDMuc2VsZWN0KCdzZWN0aW9uI2NoYXJ0ICNyaWdodC1jb2x1bW4gdWwuYWN0aXZpdGllcycpO1xuXG4vLyBDcmVhdGUgc3ZnXG52YXIgc3ZnID0gZDMuc2VsZWN0KCdzZWN0aW9uI2NoYXJ0ICNsZWZ0LWNvbHVtbiAjY2hhcnQtY29udGFpbmVyJylcblx0LmFwcGVuZCgnc3ZnJylcblx0LmF0dHIoJ3dpZHRoJywgJzEwMCUnKVxuO1xuXG52YXIgc3ZnQmFja2dyb3VuZCA9IHN2Zy5hcHBlbmQoJ3JlY3QnKVxuXHQuYXR0cignd2lkdGgnLCAnMTAwJScpXG5cdC5hdHRyKCdoZWlnaHQnLCAnMTAwJScpXG5cdC5hdHRyKCdmaWxsJywgJ3JnYmEoMCwwLDAsMCknKVxuXHQuYXR0cignaWQnLCAnc3ZnLWJhY2tncm91bmQnKVxuO1xudmFyIGRlZnMgPSBzdmcuYXBwZW5kKCdkZWZzJyk7XG52YXIgbGluZUNvbnRhaW5lciA9IHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdpZCcsICdsaW5lLWNvbnRhaW5lcicpO1xudmFyIHBhdGhDb250YWluZXIgPSBzdmcuYXBwZW5kKCdnJykuYXR0cignaWQnLCAncGF0aC1jb250YWluZXInKTtcbnZhciBjaXJjbGVDb250YWluZXIgPSBzdmcuYXBwZW5kKCdnJykuYXR0cignaWQnLCAnY2lyY2xlLWNvbnRhaW5lcicpO1xudmFyIG5vd0xpbmVDb250YWluZXIgPSBzdmcuYXBwZW5kKCdnJykuYXR0cignaWQnLCAnbm93LWxpbmUtY29udGFpbmVyJyk7XG52YXIgYXhpc0NvbnRhaW5lciA9IHN2Zy5hcHBlbmQoJ2cnKS5hdHRyKCdpZCcsICdheGlzLWNvbnRhaW5lcicpO1xuYXhpc0NvbnRhaW5lclxuXHQuYXBwZW5kKCdyZWN0Jylcblx0LmF0dHIoJ3dpZHRoJywgJzEwMCUnKVxuXHQuYXR0cignaGVpZ2h0JywgJzM2Jylcblx0LmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoMCwgLTM2KScpXG47XG5cbnZhciB0aW1lQXhpcyA9IGQzLnN2Zy5heGlzKClcblx0Ly8gLnRpY2tzKDUpXG5cdC5vcmllbnQoJ3RvcCcpXG5cdC8vIC50aWNrRm9ybWF0KHRpbWVNb2R1bGUudGltZU1zMkhobW0pXG47XG5cbnZhciB6b29tSGFuZGxlciA9IGQzLmJlaGF2aW9yLnpvb20oKTtcbmF4aXNDb250YWluZXIuY2FsbCh6b29tSGFuZGxlcik7XG5cbi8vIFBhbm5pbmcgYWxvbmcgeC1heGlzXG5heGlzQ29udGFpbmVyLm9uKCd3aGVlbCcsIGZ1bmN0aW9uIChldmVudCkge1xuXHR2YXIgZHggPSBkMy5ldmVudC53aGVlbERlbHRhWDtcblx0dmFyIGR5ID0gZDMuZXZlbnQud2hlZWxEZWx0YVk7XG5cblx0Ly8gQWJvdXQgMjAgbWlsbGlzZWNvbmRzIGJldHdlZW4gZXZlbnRzXG5cblx0aWYgKE1hdGguYWJzKGR5KSA+IE1hdGguYWJzKGR4KSkge1xuXHRcdHJldHVyblxuXHR9XG5cblx0dmFyIHRyYW5zbGF0aW9uID0gZHgqMC4yNTtcblxuXHR2YXIgciA9IHRTY2FsZS5yYW5nZSgpO1xuXHR2YXIgZCA9IHIubWFwKGZ1bmN0aW9uICh2KSB7XG5cdFx0cmV0dXJuIHRTY2FsZS5pbnZlcnQodiAtIHRyYW5zbGF0aW9uKTtcblx0fSk7XG5cblx0dFNjYWxlLmRvbWFpbihkKTtcblxuXHR6b29tSGFuZGxlci54KHRTY2FsZSk7XG59KTtcblxuem9vbUhhbmRsZXIub24oJ3pvb20nLCBmdW5jdGlvbiAoKSB7XG5cdHVwZGF0ZURTY2FsZSgpO1xuXHR1cGRhdGVEaXNwbGF5KCk7XG59KTtcblxuXG52YXIgZ2V0U3ZnV2lkdGggPSBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBwYXJzZUludChzdmcuc3R5bGUoJ3dpZHRoJykpO1xufTtcblxudmFyIGdldExhdGVzdFRpbWUgPSBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBNYXRoLm1heChkYXRhLmxhc3QoKS50LCB0Tm93KTtcbn07XG5cbnZhciBzb3J0RGF0YSA9IGZ1bmN0aW9uIChkYXRhKSB7XG5cdHJldHVybiBkYXRhLnNsaWNlKCkuc29ydChmdW5jdGlvbiAoYSwgYikge1xuXHRcdHJldHVybiBhLnQgLSBiLnQ7XG5cdH0pO1xufTtcblxudmFyIGNvcHlEYXRhID0gZnVuY3Rpb24gKGRhdGEpIHtcblx0cmV0dXJuIGRhdGEuc2xpY2UoMCk7XG59O1xuXG52YXIgcHJpbnREYXRhID0gZnVuY3Rpb24gKGRhdGEpIHtcblx0dmFyIHN0ciA9IFwiXCI7XG5cdGRhdGEuZm9yRWFjaChmdW5jdGlvbiAoaXRlbSl7XG5cdFx0c3RyICs9IFwiXFxudDogXCIgKyBpdGVtLnQgKyBcIiBpOiBcIiArIGl0ZW0uaTtcblx0fSk7XG59O1xuXG52YXIgZHVyYXRpb25NaW4gPSA1KjYwKjEwMDA7XG5cbnZhciB0U2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKTtcbnZhciBpU2NhbGUgPSBkMy5zY2FsZS5saW5lYXIoKTtcbnZhciBkU2NhbGUgPSBkMy50aW1lLnNjYWxlKCk7XG5cblxudmFyIHVwZGF0ZVRTY2FsZSA9IGZ1bmN0aW9uICgpIHtcblx0dXBkYXRlVFNjYWxlUmFuZ2UoKTtcblx0dXBkYXRlVFNjYWxlRG9tYWluKCk7XG5cblx0em9vbUhhbmRsZXIueCh0U2NhbGUpO1xuXG5cdHVwZGF0ZURTY2FsZSgpO1xufTtcblxudmFyIHVwZGF0ZVRTY2FsZVJhbmdlID0gZnVuY3Rpb24gKCkge1xuXHR0U2NhbGUucmFuZ2UoWzAsIGdldFN2Z1dpZHRoKCldKTtcbn07XG5cbnZhciB1cGRhdGVUU2NhbGVEb21haW4gPSBmdW5jdGlvbiAoKSB7XG5cdHZhciB0RG9tYWluID0gW2RhdGFbMF0udCwgZ2V0TGF0ZXN0VGltZSgpXTtcblxuXHRpZiAodERvbWFpblsxXSAtIHREb21haW5bMF0gPCBkdXJhdGlvbk1pbikge1xuXHRcdHREb21haW5bMV0gPSB0RG9tYWluWzBdICsgZHVyYXRpb25NaW47XG5cdH07XG5cblx0dmFyIHRNYXJnaW4gPSAodERvbWFpblsxXS10RG9tYWluWzBdKSowLjA1O1xuXHR0RG9tYWluWzBdIC09IHRNYXJnaW47XG5cdHREb21haW5bMV0gKz0gdE1hcmdpbjtcblxuXHR0U2NhbGUuZG9tYWluKHREb21haW4pO1xufTtcblxudmFyIHVwZGF0ZURTY2FsZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHREb21haW4gPSB0U2NhbGUuZG9tYWluKCk7XG5cdGRTY2FsZVxuXHRcdC5kb21haW4oW25ldyBEYXRlKHREb21haW5bMF0pLCBuZXcgRGF0ZSh0RG9tYWluWzFdKV0pXG5cdFx0LnJhbmdlKHRTY2FsZS5yYW5nZSgpKVxuXHQ7XG5cblx0dGltZUF4aXMuc2NhbGUoZFNjYWxlKTtcbn07XG5cbnZhciB1cGRhdGVJU2NhbGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBpRG9tYWluID0gWzAsIGFjdGl2aXR5TmFtZXMubGVuZ3RoLTFdO1xuXHR2YXIgaVJhbmdlID0gW2hVbml0KjAuNSwoaURvbWFpblsxXS1pRG9tYWluWzBdKzAuNSkqaFVuaXRdO1xuXHRpU2NhbGVcblx0XHQuZG9tYWluKGlEb21haW4pXG5cdFx0LnJhbmdlUm91bmQoaVJhbmdlKVxuXHRcdC5jbGFtcCh0cnVlKVxuXHQ7XG59O1xuXG52YXIgc2F2ZURhdGEgPSBmdW5jdGlvbiAoKSB7XG5cdHBlcnNpc3RlbmNlTW9kdWxlLnNhdmVEYXRhKHtcblx0XHRkYXRhOiBkYXRhLFxuXHRcdGFjdGl2aXR5TmFtZXM6IGFjdGl2aXR5TmFtZXMsXG5cdFx0YXV0b1VwZGF0ZTogYXV0b1VwZGF0ZSxcblx0XHR0Tm93OiB0Tm93XG5cdH0pO1xufTtcblxudmFyIGxvYWREYXRhID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgbG9hZGVkRGF0YSA9IHBlcnNpc3RlbmNlTW9kdWxlLmxvYWREYXRhKCk7XG5cdGlmIChsb2FkZWREYXRhKSB7XG5cdFx0ZGF0YSA9IGxvYWRlZERhdGEuZGF0YTtcblx0XHRhY3Rpdml0eU5hbWVzID0gbG9hZGVkRGF0YS5hY3Rpdml0eU5hbWVzO1xuXHRcdGF1dG9VcGRhdGUgPSBsb2FkZWREYXRhLmF1dG9VcGRhdGU7XG5cblx0XHRpZiAoYXV0b1VwZGF0ZSkge1xuXHRcdFx0dE5vdyA9IERhdGUubm93KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHROb3cgPSBsb2FkZWREYXRhLnROb3c7XG5cdFx0fVxuXHR9XG5cdHVwZGF0ZUlTY2FsZSgpO1xuXHR1cGRhdGVUU2NhbGUoKTtcbn07XG5cbmxvYWREYXRhKCk7XG5cbnZhciB4RnVuY3Rpb24gPSBmdW5jdGlvbiAoZCkge1xuXHRyZXR1cm4gdFNjYWxlKGQudCk7XG59O1xuXG52YXIgeUZ1bmN0aW9uID0gZnVuY3Rpb24gKGQpIHtcblx0cmV0dXJuIGlTY2FsZShkLmkpO1xufTtcblxudmFyIHJlc2V0Q2hhcnQgPSBmdW5jdGlvbiAoKSB7XG5cdGxpbmVDb250YWluZXIuc2VsZWN0QWxsKCcqJykucmVtb3ZlKCk7XG5cdHVwZGF0ZURpc3BsYXkoKTtcblx0ZGF0YSA9IGNvcHlEYXRhKHNvcnRlZERhdGEpO1xufTtcblxudmFyIGRyYWdDaXJjbGUgPSBkMy5iZWhhdmlvci5kcmFnKClcblx0Lm9uKCdkcmFnc3RhcnQnLCBmdW5jdGlvbiAoZCwgaSkge1xuXHRcdGRlYWN0aXZhdGVVcGRhdGVEaXNwbGF5VGltZXIoKTtcblxuXHRcdHZhciB0YXJnZXQgPSBkMy5zZWxlY3QodGhpcyk7XG5cdFx0dmFyIHggPSB0YXJnZXQuYXR0cignY3gnKTtcblx0XHR2YXIgdCA9IHRTY2FsZS5pbnZlcnQoeCk7XG5cblx0XHRjaXJjbGVDb250YWluZXJcblx0XHRcdC5hcHBlbmQoJ3RleHQnKVxuXHRcdFx0LmF0dHIoJ3RleHQtYW5jaG9yJywgJ21pZGRsZScpXG5cdFx0XHQuYXR0cigneCcsIHgpXG5cdFx0XHQuYXR0cigneScsIHBhcnNlSW50KHRhcmdldC5hdHRyKCdjeScpKSAtIHIpXG5cdFx0XHQudGV4dCgnJyArIHRpbWVNb2R1bGUudGltZU1zMkhobW0odCkpXG5cdFx0O1xuXHR9KVxuXHQub24oJ2RyYWcnLFx0ZnVuY3Rpb24gKGQsIGkpIHtcblx0XHR2YXIgdGFyZ2V0ID0gZDMuc2VsZWN0KHRoaXMpO1xuXG5cdFx0dmFyIHggPSBkMy5ldmVudC54O1xuXHRcdHZhciB5ID0gZDMuZXZlbnQueTtcblx0XHQvLyB0YXJnZXQuYXR0cignY3knLCB5KTtcblxuXHRcdHZhciB0ID0gdFNjYWxlLmludmVydCh4KTtcblx0XHR2YXIgaU5ldyA9IE1hdGgucm91bmQoaVNjYWxlLmludmVydCh5KSk7XG5cdFx0ZGF0YVtpXS50ID0gdDtcblx0XHRkYXRhW2ldLmkgPSBpTmV3O1xuXG5cdFx0dGFyZ2V0LmF0dHIoJ2N4JywgeCk7XG5cdFx0dGFyZ2V0LmF0dHIoJ2N5JywgeSk7XG5cblx0XHRjaXJjbGVDb250YWluZXJcblx0XHRcdC5zZWxlY3QoJ3RleHQnKVxuXHRcdFx0LmF0dHIoJ3gnLCB4KVxuXHRcdFx0LmF0dHIoJ3knLCBpU2NhbGUoaU5ldykgLSByKVxuXHRcdFx0LnRleHQoJycgKyB0aW1lTW9kdWxlLnRpbWVNczJIaG1tKHQpKVxuXHRcdDtcblxuXHRcdHVwZGF0ZURpc3BsYXkoKTtcblx0fSlcblx0Lm9uKCdkcmFnZW5kJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFVwZGF0ZSB0aGUgbGFzdCBkYXRhIHBvaW50XG5cblx0XHQvLyBVcGRhdGUgdGhlIGdyYXBoaWNzXG5cdFx0dXBkYXRlRGlzcGxheSgpO1xuXG5cdFx0ZGF0YSA9IGNvcHlEYXRhKHNvcnRlZERhdGEpO1xuXG5cdFx0Y2lyY2xlQ29udGFpbmVyXG5cdFx0XHQuc2VsZWN0QWxsKCd0ZXh0Jylcblx0XHRcdC5yZW1vdmUoKVxuXHRcdDtcblxuXHRcdGlmIChhdXRvVXBkYXRlKSB7XG5cdFx0XHRhY3RpdmF0ZVVwZGF0ZURpc3BsYXlUaW1lcigpO1xuXHRcdH1cblxuXHRcdHNhdmVEYXRhKCk7XG5cdH0pXG47XG5cbnZhciB0b0ludGVydmFscyA9IGZ1bmN0aW9uIChkYXRhKSB7XG5cdHZhciBkID0gc29ydERhdGEoZGF0YSk7XG5cdGQucHVzaCh7XG5cdFx0dDogZ2V0TGF0ZXN0VGltZSgpXG5cdH0pO1xuXG5cdHZhciBpbnRlcnZhbHMgPSBbXTtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSArPSAxKSB7XG5cdFx0dmFyIGRpID0gZFtpXTtcblx0XHRpbnRlcnZhbHMucHVzaCh7XG5cdFx0XHRpOiBkaS5pLFxuXHRcdFx0YzogZGkuYyxcblx0XHRcdHQxOiBkaS50LFxuXHRcdFx0dDI6IGRbaSArIDFdLnRcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiBpbnRlcnZhbHM7XG59O1xuXG52YXIgdXBkYXRlRGlzcGxheSA9IGZ1bmN0aW9uICgpIHtcblx0Ly8gQ29weSB0aGUgZGF0YSBhbmQgc29ydCBpdFxuXHRzb3J0ZWREYXRhID0gc29ydERhdGEoY29weURhdGEoZGF0YSkpO1xuXHR2YXIgaW50ZXJ2YWxzID0gdG9JbnRlcnZhbHMoZGF0YSk7XG5cblx0cmVwb3J0TW9kdWxlLndyaXRlUmVwb3J0KGludGVydmFscywgc3VtcywgYWN0aXZpdHlOYW1lcyk7XG5cblx0dmFyIG5vdyA9IHsgdDogdE5vdywgaTogc29ydGVkRGF0YS5sYXN0KCkuaSB9O1xuXHR1cGRhdGVOb3dMaW5lKFtub3ddKTtcblxuXHQvLyBTdW0gdGhlIHRpbWUgb24gZWFjaCBhY3Rpdml0eVxuXHQvLyBzdW1zID0gdGltZU1vZHVsZS5zdW0oc29ydGVkRGF0YSwgYWN0aXZpdHlOYW1lcyk7XG5cdHN1bXMgPSB0aW1lTW9kdWxlLnN1bShpbnRlcnZhbHMsIGFjdGl2aXR5TmFtZXMpO1xuXG5cdC8vIFJlc2NhbGUgdGhlIGNoYXJ0IGNvbnRhaW5lciBpZiBuZWNlc3Nhcnlcblx0dmFyIGhlaWdodCA9IGFjdGl2aXR5TmFtZXMubGVuZ3RoKmhVbml0ICsgMzZcblx0c3ZnLmF0dHIoJ2hlaWdodCcsIGhlaWdodCk7XG5cblx0Ly8gVXBkYXRlIHRpbWVBeGlzXG5cdGF4aXNDb250YWluZXIuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgwLCcgKyBoZWlnaHQgKyAnKScpO1xuXHRheGlzQ29udGFpbmVyLmNhbGwodGltZUF4aXMpO1xuXG5cdHRpbWVBeGlzLnRpY2tzKE1hdGgucm91bmQoZ2V0U3ZnV2lkdGgoKS85NSkpO1xuXG5cdHVwZGF0ZUNoYXJ0KHN1bXMsIGludGVydmFscyk7XG5cdHVwZGF0ZUFjdGl2aXRpZXMoc3Vtcyk7XG5cdHNldEFjdGl2ZUFjdGl2aXR5KHNvcnRlZERhdGEubGFzdCgpLmkpO1xuXG5cdHN1bXNNb2R1bGUudXBkYXRlRGlzcGxheShzdW1zLCBhY3Rpdml0eU5hbWVzKTtcbn07XG5cbnZhciB1cGRhdGVOb3dMaW5lID0gZnVuY3Rpb24gKGRhdGEpIHtcblx0dmFyIG5vd0xpbmUgPSBub3dMaW5lQ29udGFpbmVyLnNlbGVjdEFsbCgnbGluZScpLmRhdGEoZGF0YSlcblx0bm93TGluZS5leGl0KCkucmVtb3ZlKCk7XG5cdG5vd0xpbmVcblx0XHQuZW50ZXIoKVxuXHRcdC5hcHBlbmQoJ2xpbmUnKVxuXHQ7XG5cblx0bm93TGluZVxuXHRcdC5hdHRyKCd4MScsIHhGdW5jdGlvbilcblx0XHQuYXR0cigneDInLCB4RnVuY3Rpb24pXG5cdFx0LmF0dHIoJ3kxJywgMClcblx0XHQuYXR0cigneTInLCAnMTAwJScpXG5cdDtcbn07XG5cbnZhciB1cGRhdGVDaGFydCA9IGZ1bmN0aW9uIChzdW1zLCBpbnRlcnZhbHMpIHtcblx0Ly8gSG9yaXpvbnRhbCBsaW5lcyBmb3IgZWFjaCBhY3Rpdml0eVxuXHR2YXIgbGluZXMgPSBsaW5lQ29udGFpbmVyLnNlbGVjdEFsbCgnbGluZScpLmRhdGEoc3Vtcyk7XG5cdGxpbmVzLmV4aXQoKS5yZW1vdmUoKTtcblx0bGluZXNcblx0XHQuZW50ZXIoKVxuXHRcdC5hcHBlbmQoJ2xpbmUnKVxuXHQ7XG5cdGxpbmVzXG5cdFx0LmF0dHIoJ3gxJywgMClcblx0XHQuYXR0cigneDInLCAnMTAwJScpXG5cdFx0LmF0dHIoJ3kxJywgeUZ1bmN0aW9uKVxuXHRcdC5hdHRyKCd5MicsIHlGdW5jdGlvbilcblx0O1xuXG5cdHVwZGF0ZUNoYXJ0QmxvY2tzKGludGVydmFscyk7XG5cblx0Ly8gSm9pbiB0aGUgZGF0YSBmb3IgdGhlIGNpcmNsZXNcblx0dmFyIGNpcmNsZXMgPSBjaXJjbGVDb250YWluZXIuc2VsZWN0QWxsKCdjaXJjbGUnKS5kYXRhKGludGVydmFscyk7XG5cdGNpcmNsZXMuZXhpdCgpLnJlbW92ZSgpO1xuXG5cdC8vIENyZWF0ZSBlbGVtZW50cyBmb3IgbmV3IGNpcmNsZXMgYW5kIGFkZCBkcmFnIGhhbmRsZXJcblx0Y2lyY2xlc1xuXHRcdC5lbnRlcigpXG5cdFx0LmFwcGVuZCgnY2lyY2xlJylcblx0XHQuY2FsbChkcmFnQ2lyY2xlKVxuXHQ7XG5cblx0Ly8gVXBkYXRlIGF0dHJpYnV0ZXMgZm9yIGFsbCB1cGRhdGluZyBjaXJjbGVzXG5cdGNpcmNsZXNcblx0XHQuYXR0cignY3gnLCB1dGlsLmNvbXBvc2UodFNjYWxlLCBnKCd0MScpKSlcblx0XHQuYXR0cignY3knLCB1dGlsLmNvbXBvc2UoaVNjYWxlLCBnaSkpXG5cdFx0LmF0dHIoJ3InLCByKVxuXHQ7XG59O1xuXG52YXIgdXBkYXRlQ2hhcnRMaW5lcyA9IGZ1bmN0aW9uICgpIHtcblxufTtcblxudmFyIHVwZGF0ZUNoYXJ0QmxvY2tzID0gZnVuY3Rpb24gKGludGVydmFscykge1xuXHRyZWN0RGF0YSA9IGludGVydmFscy5tYXAoZnVuY3Rpb24gKGQsIGkpIHtcblx0XHR2YXIgeDEgPSB0U2NhbGUoZC50MSk7XG5cdFx0dmFyIHgyID0gdFNjYWxlKGQudDIpO1xuXHRcdHZhciB5ID0gaVNjYWxlKGQuaSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZHRoOiB4Mi14MSxcblx0XHRcdHk6IHksXG5cdFx0XHR4OiB4MSxcblx0XHRcdHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgnICsgeDEgKyAnLCcgKyAoeSAtIGhVbml0LzIpICsgJyknLFxuXHRcdFx0aTogaSxcblx0XHRcdHQ6IGQudDEsXG5cdFx0XHRjOiBkLmMsXG5cdFx0XHRjbGlwUGF0aElkOiAndGV4dENsaXBQYXRoJyArIGlcblx0XHR9O1xuXHR9KTtcblxuXHR2YXIgb25DbGljayA9IGZ1bmN0aW9uIChkLCBpKSB7XG5cdFx0aWYgKGQzLmV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRkYXRhLnNwbGljZShpLCAxKTtcblx0XHRcdHJlc2V0Q2hhcnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2V0QWN0aXZlU2hpZnQoZClcblx0XHR9XG5cdH07XG5cblxuXHQvLyBCYWNrZ3JvdW5kIHJlY3RhbmdsZXNcblx0dmFyIHJlY3RzID0gbGluZUNvbnRhaW5lci5zZWxlY3RBbGwoJ3JlY3QnKS5kYXRhKHJlY3REYXRhKTtcblx0cmVjdHMuZXhpdCgpLnJlbW92ZSgpO1xuXHRyZWN0c1xuXHRcdC5lbnRlcigpXG5cdFx0LmFwcGVuZCgncmVjdCcpXG5cdFx0Lm9uKCdjbGljaycsIG9uQ2xpY2spXG5cdDtcblxuXG5cdHJlY3RzXG5cdFx0LmF0dHIoJ3dpZHRoJywgZygnd2lkdGgnKSlcblx0XHQuYXR0cignaGVpZ2h0JywgaFVuaXQpXG5cdFx0LmF0dHIoJ3RyYW5zZm9ybScsIGcoJ3RyYW5zZm9ybScpKVxuXHQ7XG5cblx0Ly8gQ2xpcCBwYXRoc1xuXHRjbGlwUGF0aHMgPSBkZWZzLnNlbGVjdEFsbCgnY2xpcFBhdGgnKS5kYXRhKHJlY3REYXRhKTtcblx0Y2xpcFBhdGhzLmV4aXQoKS5yZW1vdmUoKTtcblx0Y2xpcFBhdGhzXG5cdFx0LmVudGVyKClcblx0XHQuYXBwZW5kKCdjbGlwUGF0aCcpXG5cdFx0LmF0dHIoJ2lkJywgZygnY2xpcFBhdGhJZCcpKVxuXHRcdC5hcHBlbmQoJ3JlY3QnKVxuXHQ7XG5cblx0Y2xpcFJlY3RzID0gZGVmcy5zZWxlY3RBbGwoJ3JlY3QnKS5kYXRhKHJlY3REYXRhKTtcblx0Y2xpcFJlY3RzXG5cdFx0LmF0dHIoJ3dpZHRoJywgZygnd2lkdGgnKSlcblx0XHQuYXR0cignaGVpZ2h0JywgaFVuaXQpXG5cdFx0LmF0dHIoJ3RyYW5zZm9ybScsIGcoJ3RyYW5zZm9ybScpKVxuXHRcdC5hdHRyKCdmaWxsJywgJ2JsYWNrJylcblx0O1xuXG5cdC8vIFRleHRcblx0dmFyIHRleHRzID0gbGluZUNvbnRhaW5lci5zZWxlY3RBbGwoJ3RleHQnKS5kYXRhKHJlY3REYXRhKVxuXHR0ZXh0cy5leGl0KCkucmVtb3ZlKCk7XG5cdHRleHRzXG5cdFx0LmVudGVyKClcblx0XHQuYXBwZW5kKCd0ZXh0Jylcblx0XHQub24oJ2NsaWNrJywgb25DbGljaylcblx0O1xuXG5cdHRleHRzXG5cdFx0LmF0dHIoJ3gnLCBmdW5jdGlvbiAoZCkgeyByZXR1cm4gZC54ICsgMTI7XHR9KVxuXHRcdC5hdHRyKCd5JywgZnVuY3Rpb24gKGQpIHsgcmV0dXJuIGQueTsgfSlcblx0XHQudGV4dChnKCdjJykpXG5cdFx0LmF0dHIoJ2NsaXAtcGF0aCcsIGZ1bmN0aW9uIChkKSB7IHJldHVybiAndXJsKCMnICsgZC5jbGlwUGF0aElkICsgJyknOyB9KVxuXHQ7XG5cbn07XG5cbnZhciBzZXRBY3RpdmVTaGlmdCA9IGZ1bmN0aW9uIChkKSB7XG5cdHZhciB0ZXh0QXJlYSA9IGQzLnNlbGVjdCgnI2NvbW1lbnQtZWRpdCcpXG5cdFx0Lm9uKCdpbnB1dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGRhdGFbZC5pXS5jID0gdGhpcy52YWx1ZTtcblx0XHRcdHNhdmVEYXRhKCk7XG5cdFx0XHR1cGRhdGVEaXNwbGF5KCk7XG5cdFx0fSlcblx0O1xuXHR0ZXh0QXJlYS5ub2RlKCkudmFsdWUgPSBkYXRhW2QuaV0uYyB8fCBcIlwiO1xuXHR0ZXh0QXJlYS5ub2RlKCkuZm9jdXMoKTtcbn07XG5cbnZhciB1cGRhdGVBY3Rpdml0aWVzID0gZnVuY3Rpb24gKHN1bXMpIHtcblxuXHQvLyBDcmVhdGUgZGl2cyBmb3IgYWxsIGFjdGl2aXRpZXNcblx0dmFyIGFjdGl2aXRpZXMgPSBhY3Rpdml0aWVzTGlzdFxuXHRcdC5zZWxlY3RBbGwoJy5hY3Rpdml0eScpXG5cdFx0LmRhdGEoc3Vtcylcblx0O1xuXHRhY3Rpdml0aWVzLmV4aXQoKS5yZW1vdmUoKTtcblxuXHR2YXIgbmV3QWN0aXZpdGllcyA9IGFjdGl2aXRpZXNcblx0XHQuZW50ZXIoKVxuXHRcdC5hcHBlbmQoJ2xpJylcblx0XHQuY2xhc3NlZCgnYWN0aXZpdHknLCB0cnVlKVxuXHRcdC5jbGFzc2VkKCdibG9jaycsIHRydWUpXG5cdDtcblxuXHRuZXdBY3Rpdml0aWVzXG5cdFx0LmFwcGVuZCgnZGl2Jylcblx0XHQuY2xhc3NlZCgnc3dpdGNoJywgdHJ1ZSlcblx0XHQudGV4dCgnPicpXG5cdFx0Lm9uKCdjbGljaycsIHN3aXRjaFRvQWN0aXZpdHkpXG5cdDtcblxuXHRuZXdBY3Rpdml0aWVzXG5cdFx0LmFwcGVuZCgnaW5wdXQnKVxuXHRcdC5hdHRyKCd0eXBlJywgJ3RleHQnKVxuXHRcdC5hdHRyKCd2YWx1ZScsIGZ1bmN0aW9uIChkKSB7XG5cdFx0XHRyZXR1cm4gYWN0aXZpdHlOYW1lc1tkLmldO1xuXHRcdH0pXG5cdFx0Lm9uKCdpbnB1dCcsIGZ1bmN0aW9uIChkLCBpKSB7XG5cdFx0XHRhY3Rpdml0eU5hbWVzW2ldID0gdGhpcy52YWx1ZTtcblx0XHRcdHVwZGF0ZURpc3BsYXkoKTtcblx0XHR9KVxuXHQ7XG5cblx0bmV3QWN0aXZpdGllc1xuXHRcdC5hcHBlbmQoJ2RpdicpXG5cdFx0LmNsYXNzZWQoJ3RpbWUnLCB0cnVlKVxuXHQ7XG5cblx0YWN0aXZpdGllc0xpc3Quc2VsZWN0QWxsKCcudGltZScpXG5cdFx0LmRhdGEoc3Vtcylcblx0XHQudGV4dCh1dGlsLmNvbXBvc2UodGltZU1vZHVsZS5kdXJhdGlvbk1zVG9TdHJpbmcsIGd0KSlcblx0O1xuXG5cblx0YWN0aXZpdGllc1xuXHRcdC5zdHlsZSgnaGVpZ2h0JywgaFVuaXQgKyAncHgnKVxuXHRcdC5zdHlsZSgnbGluZS1oZWlnaHQnLCBoVW5pdC8yICsgJ3B4Jylcblx0O1xufTtcblxudmFyIG9uUmVzaXplID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc3ZnV2lkdGggPSBwYXJzZUludChzdmcuc3R5bGUoJ3dpZHRoJykpO1xuXG5cdHZhciB0UmFuZ2UgPSBbMCwgZ2V0U3ZnV2lkdGgoKV07XG5cdHRTY2FsZS5yYW5nZSh0UmFuZ2UpO1xuXHRkU2NhbGUucmFuZ2UodFJhbmdlKTtcblxuXHRmaXhab29tSGFuZGxlck9uUmVzaXplKHN2Z1dpZHRoKTtcblxuXHR1cGRhdGVEaXNwbGF5KCk7XG59O1xuXG52YXIgZml4Wm9vbUhhbmRsZXJPblJlc2l6ZSA9IGZ1bmN0aW9uICh3aWR0aCkge1xuXHQvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzI1ODc1MzE2L2QzLXByZXNlcnZlLXNjYWxlLXRyYW5zbGF0ZS1hZnRlci1yZXNldHRpbmctcmFuZ2Vcblx0Ly8gQ2FjaGUgc2NhbGVcblx0dmFyIGNhY2hlU2NhbGUgPSB6b29tSGFuZGxlci5zY2FsZSgpO1xuXG5cdC8vIENhY2hlIHRyYW5zbGF0ZVxuXHR2YXIgY2FjaGVUcmFuc2xhdGUgPSB6b29tSGFuZGxlci50cmFuc2xhdGUoKTtcblxuXHQvLyBDYWNoZSB0cmFuc2xhdGUgdmFsdWVzIGFzIHBlcmNlbnRhZ2VzL3JhdGlvIG9mIHRoZSBmdWxsIHdpZHRoXG5cdHZhciBjYWNoZVRyYW5zbGF0ZVBlcmMgPSB6b29tSGFuZGxlci50cmFuc2xhdGUoKS5tYXAoZnVuY3Rpb24gKHYpIHtcblx0ICByZXR1cm4gLXYvd2lkdGg7XG5cdH0pO1xuXG5cdC8vIE1hbnVhbGx5IHJlc2V0IHRoZSB6b29tSGFuZGxlclxuXHR6b29tSGFuZGxlci5zY2FsZSgxKS50cmFuc2xhdGUoWzAsIDBdKTtcblxuXHQvLyBBcHBseSB0aGUgdFNjYWxlIHRvIHRoZSB6b29tSGFuZGxlciwgKHRTY2FsZSBzaG91bGQgaGF2ZSBiZWVuIHVwZGF0ZWQgcHJlYnZpb3VzbHkpXG5cdHpvb21IYW5kbGVyLngodFNjYWxlKTtcblxuXHQvLyBSZXZlcnQgdGhlIHNjYWxlIGJhY2sgdG8gb3VyIGNhY2hlZCB2YWx1ZVxuXHR6b29tSGFuZGxlci5zY2FsZShjYWNoZVNjYWxlKTtcblxuXHQvLyBPdmVyd3JpdGUgdGhlIHggdmFsdWUgb2YgY2FjaGVUcmFuc2xhdGUgYmFzZWQgb24gb3VyIGNhY2hlZCBwZXJjZW50YWdlXG5cdGNhY2hlVHJhbnNsYXRlWzBdID0gLXdpZHRoKmNhY2hlVHJhbnNsYXRlUGVyY1swXTtcblxuXHQvLyBGaW5hbGx5IGFwcGx5IHRoZSB1cGRhdGVkIHRyYW5zbGF0ZVxuXHR6b29tSGFuZGxlci50cmFuc2xhdGUoY2FjaGVUcmFuc2xhdGUpO1xufTtcblxud2luZG93Lm9ucmVzaXplID0gb25SZXNpemU7XG5cbi8vIG9uU3VibWl0QWN0aXZpdHkgaXMgZGVjbGFyZWQgaW4gYSBzY3JpcHQgZWxlbWVudCBpbiBpbmRleC5odG1sXG5vblN1Ym1pdEFjdGl2aXR5ID0gZnVuY3Rpb24gKCkge1xuXHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgaW5wdXRFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FjdGl2aXR5LW5hbWUtaW5wdXQnKTtcblx0XHR2YXIgYWN0aXZpdHlOYW1lID0gaW5wdXRFbGVtZW50LnZhbHVlO1xuXHRcdGlucHV0RWxlbWVudC52YWx1ZSA9ICcnO1xuXHRcdGlucHV0RWxlbWVudC5ibHVyKCk7XG5cblx0XHRhY3Rpdml0eU5hbWVzLnB1c2goYWN0aXZpdHlOYW1lKTtcblx0XHR1cGRhdGVJU2NhbGUoKTtcblx0XHRzd2l0Y2hUb0FjdGl2aXR5KG51bGwsIGFjdGl2aXR5TmFtZXMubGVuZ3RoIC0gMSk7XG5cdH0pO1xuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG52YXIgc3dpdGNoVG9BY3Rpdml0eSA9IGZ1bmN0aW9uIChkLCBpKSB7XG5cdG5ld0RhdGFQb2ludChpKTtcblx0c2V0QWN0aXZlQWN0aXZpdHkoaSk7XG59O1xuXG52YXIgc2V0QWN0aXZlQWN0aXZpdHkgPSBmdW5jdGlvbiAoaSkge1xuXHR2YXIgc3dpdGNoZXMgPSBhY3Rpdml0aWVzTGlzdC5zZWxlY3RBbGwoJy5zd2l0Y2gnKVxuXHRcdC5jbGFzc2VkKCdhY3RpdmUnLCBmYWxzZSk7XG5cdGQzLnNlbGVjdChzd2l0Y2hlc1swXVtpXSkuY2xhc3NlZCgnYWN0aXZlJywgdHJ1ZSk7XG59O1xuXG52YXIgbmV3RGF0YVBvaW50ID0gZnVuY3Rpb24gKGksIHQpIHtcblx0ZGF0YS5wdXNoKHtcblx0XHRpOiBpLFxuXHRcdHQ6IHQgfHwgdE5vdyxcblx0XHRjOiBcIjxjb21tZW50PlwiLFxuXHR9KTtcblxuXHRzYXZlRGF0YSgpO1xuXHRvblJlc2l6ZSgpO1xufTtcblxuc3ZnQmFja2dyb3VuZC5vbignY2xpY2snLCBmdW5jdGlvbiAoKSB7XG5cdGlmICghZDMuZXZlbnQuc2hpZnRLZXkpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0dmFyIGkgPSBNYXRoLnJvdW5kKGlTY2FsZS5pbnZlcnQoZDMuZXZlbnQub2Zmc2V0WSkpO1xuXHR2YXIgdCA9IHRTY2FsZS5pbnZlcnQoZDMuZXZlbnQub2Zmc2V0WCk7XG5cdG5ld0RhdGFQb2ludChpLCB0KTtcblx0cmVzZXRDaGFydCgpO1xufSk7XG5cbnZhciBhY3RpdmF0ZVVwZGF0ZURpc3BsYXlUaW1lciA9IGZ1bmN0aW9uICgpIHtcblx0dXBkYXRlRGlzcGxheVRpbWVyID0gdXRpbC5zZXRJbnRlcnZhbE5vdyhmdW5jdGlvbiAoKSB7XG5cdFx0dE5vdyA9IHRpbWVNb2R1bGUubm93KCk7XG5cdFx0dXBkYXRlRGlzcGxheSgpO1xuXHR9LCAxMDAwKTtcbn07XG5cbnZhciBkZWFjdGl2YXRlVXBkYXRlRGlzcGxheVRpbWVyID0gZnVuY3Rpb24gKCkge1xuXHRjbGVhckludGVydmFsKHVwZGF0ZURpc3BsYXlUaW1lcik7XG59O1xuXG5kMy5zZWxlY3QoJyNhdXRvLXVwZGF0ZScpLm9uKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcblx0YXV0b1VwZGF0ZSA9IHRoaXMuY2hlY2tlZDtcblx0aWYgKGF1dG9VcGRhdGUpIHtcblx0XHRhY3RpdmF0ZVVwZGF0ZURpc3BsYXlUaW1lcigpO1xuXHR9IGVsc2Uge1xuXHRcdGRlYWN0aXZhdGVVcGRhdGVEaXNwbGF5VGltZXIoKTtcblx0fVxuXHRzYXZlRGF0YSgpO1xufSkubm9kZSgpLmNoZWNrZWQgPSBhdXRvVXBkYXRlO1xuXG51cGRhdGVUU2NhbGUoKTtcbnVwZGF0ZUlTY2FsZSgpO1xuaWYgKGF1dG9VcGRhdGUpIHtcblx0YWN0aXZhdGVVcGRhdGVEaXNwbGF5VGltZXIoKTtcbn1cbm9uUmVzaXplKCk7XG5zZXRBY3RpdmVBY3Rpdml0eShkYXRhLmxhc3QoKS5pKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvZmFrZV9iMjQ1NWI4Mi5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIENyZWRpdCB0byBodHRwczovL3RoaXNjb3VsZGJlYmV0dGVyLndvcmRwcmVzcy5jb20vMjAxMi8xMi8xOC9sb2FkaW5nLWVkaXRpbmctYW5kLXNhdmluZy1hLXRleHQtZmlsZS1pbi1odG1sNS11c2luZy1qYXZhc2NyaXAvXG5cbnZhciBzYXZlID0gZnVuY3Rpb24oZGF0YSwgZmlsZU5hbWUpIHtcblx0dmFyIHRleHRGaWxlQXNCbG9iID0gbmV3IEJsb2IoXG5cdFx0W0pTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDIpXSxcblx0XHR7dHlwZTonYXBwbGljYXRpb24vanNvbid9XG5cdCk7XG5cblx0dmFyIGZpbGVOYW1lID0gZmlsZU5hbWUgfHwgXCJ0aW1la2VlcGVyIFwiICsgKG5ldyBEYXRlKCkpLnRvU3RyaW5nKCk7XG5cblx0dmFyIGRvd25sb2FkTGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuXHRkb3dubG9hZExpbmsuZG93bmxvYWQgPSBmaWxlTmFtZTtcblx0ZG93bmxvYWRMaW5rLmlubmVySFRNTCA9IFwiRG93bmxvYWQgRmlsZVwiO1xuXG5cdGRvd25sb2FkTGluay5ocmVmID0gVVJMLmNyZWF0ZU9iamVjdFVSTCh0ZXh0RmlsZUFzQmxvYik7XG5cblx0ZG93bmxvYWRMaW5rLmNsaWNrKCk7XG59O1xuXG52YXIgbG9hZCA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSkge1xuXHRcdHZhciBmaWxlVG9Mb2FkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcInNlY3Rpb24jbWVudSAjbG9hZFwiKS5maWxlc1swXTtcblxuXHRcdC8vIENyZWF0ZSBmaWxlcmVhZGVyXG5cdFx0dmFyIGZpbGVSZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG5cdFx0Ly8gQWRkIG9ubG9hZCBmdW5jdGlvbiB0byBmaWxlcmVhZGVyXG5cdFx0ZmlsZVJlYWRlci5vbmxvYWQgPSBmdW5jdGlvbihmaWxlTG9hZGVkRXZlbnQpIHtcblx0XHRcdHZhciBvYmogPSBKU09OLnBhcnNlKGZpbGVMb2FkZWRFdmVudC50YXJnZXQucmVzdWx0KTtcblx0XHRcdHJlc29sdmUob2JqKTtcblx0XHR9O1xuXG5cdFx0Ly8gTWFrZSBmaWxlcmVhZGVyIHJlYWQgZmlsZVxuXHRcdGZpbGVSZWFkZXIucmVhZEFzVGV4dChmaWxlVG9Mb2FkLCBcIlVURi04XCIpO1xuXHR9KTtcbn07XG5cbmV4cG9ydHMuc2F2ZSA9IHNhdmU7XG5leHBvcnRzLmxvYWQgPSBsb2FkO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9maWxlLW1vZHVsZS5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBzdG9yYWdlID0gd2luZG93LmxvY2FsU3RvcmFnZTtcbnRyeSB7XG5cdHZhciB4ID0gJ19fc3RvcmFnZV90ZXN0X18nO1xuXHRzdG9yYWdlW3hdID0geDtcblx0ZGVsZXRlIHN0b3JhZ2VbeF07XG5cdHZhciBrZXkgPSAndGltZWtlZXBlci1kYXRhJztcbn0gY2F0Y2goZSkge1xuXHRhbGVydChcIldhcm5pbmc6IGxvY2FsU3RvcmFnZSBub3QgYXZhaWxhYmxlLiBZb3VyIGRhdGEgd2lsbCBub3QgYmUgYXV0b3NhdmVkLlwiICsgZSk7XG5cdGNvbnNvbGUubG9nKGUpO1xuXHRzdG9yYWdlID0gbnVsbDtcbn1cblxudmFyIHNhdmVEYXRhID0gZnVuY3Rpb24gKGRhdGEpIHtcblx0aWYgKHN0b3JhZ2UpIHtcblx0XHRzdG9yYWdlW2tleV0gPSBKU09OLnN0cmluZ2lmeShkYXRhKTtcblx0fVxufTtcblxudmFyIGxvYWREYXRhID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoc3RvcmFnZSAmJiBzdG9yYWdlLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShzdG9yYWdlW2tleV0pO1xuXHR9XG59O1xuXG5leHBvcnRzLnNhdmVEYXRhID0gc2F2ZURhdGE7XG5leHBvcnRzLmxvYWREYXRhID0gbG9hZERhdGE7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL3BlcnNpc3RlbmNlLW1vZHVsZS5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB0aW1lTW9kdWxlID0gcmVxdWlyZSgnLi90aW1lLW1vZHVsZScpO1xuXG52YXIgd3JpdGVSZXBvcnQgPSBmdW5jdGlvbiAoaW50ZXJ2YWxzLCBzdW1zLCBhY3Rpdml0eU5hbWVzKSB7XG5cdHRyeSB7XG5cdFx0dmFyIG5sID0gXCJcXHJcXG5cIjtcblx0XHR2YXIgdGFiID0gXCJcXHRcIjtcblx0XHR2YXIgdGFidGFiID0gXCJcXHRcXHRcIjtcblx0XHR2YXIgc2VwID0gXCIgfCBcIlxuXG5cdFx0dmFyIGFjdGl2aXRpZXMgPSBhY3Rpdml0eU5hbWVzLm1hcChmdW5jdGlvbiAoYWN0aXZpdHlOYW1lLCBpKSB7XG5cdFx0XHR2YXIgYWN0aXZpdHkgPSBhY3Rpdml0eU5hbWUgKyBzZXAgKyB0aW1lTW9kdWxlLmR1cmF0aW9uTXNUb1N0cmluZyhzdW1zW2ldLnQpICsgbmw7XG5cblx0XHRcdHNlc3Npb25zID0gaW50ZXJ2YWxzLmZpbHRlcihmdW5jdGlvbiAoc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbi5pID09PSBpO1xuXHRcdFx0fSkuZm9yRWFjaChmdW5jdGlvbiAoc2Vzc2lvbikge1xuXHRcdFx0XHRhY3Rpdml0eSArPSB0YWIgKyB0aW1lTW9kdWxlLnRpbWVNczJIaG1tKHNlc3Npb24udDEpXG5cdFx0XHRcdFx0KyBcIi1cIiArIHRpbWVNb2R1bGUudGltZU1zMkhobW0oc2Vzc2lvbi50Milcblx0XHRcdFx0XHQrIHNlcCArIHRpbWVNb2R1bGUuZHVyYXRpb25Nc1RvU3RyaW5nKHNlc3Npb24udDIgLSBzZXNzaW9uLnQxKSArIG5sO1xuXG5cdFx0XHRcdGFjdGl2aXR5ICs9IHRhYnRhYiArIHNlc3Npb24uYyArIG5sO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBhY3Rpdml0eTtcblx0XHR9KTtcblx0XHRkMy5zZWxlY3QoJyNyZXBvcnQnKS5ub2RlKCkuaW5uZXJIVE1MID0gYWN0aXZpdGllcy5qb2luKG5sKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdH1cbn07XG5cbmV4cG9ydHMud3JpdGVSZXBvcnQgPSB3cml0ZVJlcG9ydDtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvcmVwb3J0LW1vZHVsZS5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciB1cmwgPSAnaHR0cDovL2xvY2FsaG9zdDo4NzY4L2FwaS8nO1xuXG4vLyBGcm9tIGh0dHA6Ly93d3cuaHRtbDVyb2Nrcy5jb20vZW4vdHV0b3JpYWxzL2NvcnMvXG52YXIgY3JlYXRlQ09SU1JlcXVlc3QgPSBmdW5jdGlvbihtZXRob2QsIHVybCkge1xuXHR2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cdGlmIChcIndpdGhDcmVkZW50aWFsc1wiIGluIHhocikge1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIFhNTEh0dHBSZXF1ZXN0IG9iamVjdCBoYXMgYSBcIndpdGhDcmVkZW50aWFsc1wiIHByb3BlcnR5LlxuXHRcdC8vIFwid2l0aENyZWRlbnRpYWxzXCIgb25seSBleGlzdHMgb24gWE1MSFRUUFJlcXVlc3QyIG9iamVjdHMuXG5cdFx0eGhyLm9wZW4obWV0aG9kLCB1cmwsIHRydWUpO1xuXG5cdH0gZWxzZSBpZiAodHlwZW9mIFhEb21haW5SZXF1ZXN0ICE9IFwidW5kZWZpbmVkXCIpIHtcblxuXHRcdC8vIE90aGVyd2lzZSwgY2hlY2sgaWYgWERvbWFpblJlcXVlc3QuXG5cdFx0Ly8gWERvbWFpblJlcXVlc3Qgb25seSBleGlzdHMgaW4gSUUsIGFuZCBpcyBJRSdzIHdheSBvZiBtYWtpbmcgQ09SUyByZXF1ZXN0cy5cblx0XHR4aHIgPSBuZXcgWERvbWFpblJlcXVlc3QoKTtcblx0XHR4aHIub3BlbihtZXRob2QsIHVybCk7XG5cblx0fSBlbHNlIHtcblxuXHRcdC8vIE90aGVyd2lzZSwgQ09SUyBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBicm93c2VyLlxuXHRcdHhociA9IG51bGw7XG5cblx0fVxuXHRpZiAoIXhocikge1xuXHRcdHRocm93IG5ldyBFcnJvcignQ09SUyBub3Qgc3VwcG9ydGVkJyk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHhocjtcblx0fVxufVxuXG5cbi8vIEFsbCBkYXRhIGhhcyB0byBiZSB3cml0dGVuIGFuZCByZWFkLCBpbmNsdWRpbmcgYWN0aXZpdHkgbmFtZXMgYW5kIGNvbW1lbnRzXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oZGF0YSkge1xuXHR2YXIgeGhyID0gY3JlYXRlQ09SU1JlcXVlc3QoJ1BPU1QnLCB1cmwpO1xuXHR4aHIuc2VuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XG59O1xuXG5leHBvcnRzLnJlYWQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuXHR2YXIgeGhyID0gY3JlYXRlQ09SU1JlcXVlc3QoJ0dFVCcsIHVybCk7XG5cdHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0XHR2YXIgb2JqID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcblx0XHRjb25zb2xlLmxvZyhcIlNlcnZlciByZWFkXCIpO1xuXHRcdGNvbnNvbGUubG9nKG9iaik7XG5cdFx0Y2FsbGJhY2sob2JqKTtcblx0fVxuXHR4aHIuc2VuZCgpO1xufTtcblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL3NlcnZlci1pbnRlcmFjdGlvbnMuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgdGltZU1vZHVsZSA9IHJlcXVpcmUoJy4vdGltZS1tb2R1bGUnKTtcblxudmFyIHN1bXNBY3Rpdml0aWVzVGFibGUgPSBkMy5zZWxlY3QoJ3NlY3Rpb24jc3VtcyB0YWJsZSNhY3Rpdml0aWVzJyk7XG5cblxuXG52YXIgbkNoZWNrYm94ZXNQZXJSb3cgPSA1O1xuXG5cblxudmFyIHN1bXNSb3cgPSBzdW1zQWN0aXZpdGllc1RhYmxlXG5cdC5hcHBlbmQoJ3RyJylcblx0LmF0dHIoJ2lkJywgJ3N1bXMnKVxuO1xuXG5zdW1zUm93XG5cdC5hcHBlbmQoJ3RkJylcblx0Lmh0bWwoJ1N1bXMnKVxuO1xuXG5mb3IgKHZhciBpID0gMDsgaSA8IG5DaGVja2JveGVzUGVyUm93OyBpKyspIHtcblx0c3Vtc1Jvd1xuXHRcdC5hcHBlbmQoJ3RkJylcblx0XHQuY2xhc3NlZCgnc3VtJywgdHJ1ZSlcblx0O1xufVxuXG5cblxudmFyIHVwZGF0ZURpc3BsYXkgPSBmdW5jdGlvbihzdW1zLCBhY3Rpdml0eU5hbWVzKSB7XG5cblx0Ly8gU3VtcyBzdHVmZlxuXHQvLyBTZWxlY3QgYWxsIHJvd3Mgd2l0aCBjaGVja2JveGVzXG5cdHZhciBzdW1zQWN0aXZpdGllc1Jvd3MgPSBzdW1zQWN0aXZpdGllc1RhYmxlXG5cdFx0LnNlbGVjdEFsbCgndHIuY2hlY2tib3gtcm93Jylcblx0XHQuZGF0YShzdW1zKVxuXHQ7XG5cblx0Ly8gQWRkIG5ldyByb3dzIGlmIG5lZWRlZFxuXHR2YXIgbmV3Um93cyA9IHN1bXNBY3Rpdml0aWVzUm93c1xuXHRcdC5lbnRlcigpXG5cdFx0LmFwcGVuZCgndHInKVxuXHRcdC5jbGFzc2VkKCdjaGVja2JveC1yb3cnLCB0cnVlKVxuXHQ7XG5cdHN1bXNBY3Rpdml0aWVzUm93cy5leGl0KCkucmVtb3ZlKCk7XG5cblxuXHQvLyBBZGQgYWN0aXZpdHkgbmFtZSBjZWxsc1xuXHRuZXdSb3dzXG5cdFx0LmFwcGVuZCgndGQnKVxuXHRcdC5jbGFzc2VkKCdhY3Rpdml0eScsIHRydWUpXG5cdDtcblxuXHQvLyBBZGQgY2hlY2tib3ggY2VsbHNcblx0bmV3Um93c1xuXHRcdC5lYWNoKGNyZWF0ZUNoZWNrYm94ZXMpXG5cdDtcblxuXHQvLyBVcGRhdGUgdGV4dCBpbiBhY3Rpdml0aWVzXG5cdHN1bXNBY3Rpdml0aWVzVGFibGVcblx0XHQuc2VsZWN0QWxsKCcuYWN0aXZpdHknKVxuXHRcdC5kYXRhKHN1bXMpXG5cdFx0Lmh0bWwoZnVuY3Rpb24oZCkge1xuXHRcdFx0cmV0dXJuIGFjdGl2aXR5TmFtZXNbZC5pXSArICc8YnI+JyArIHRpbWVNb2R1bGUuZHVyYXRpb25Nc1RvU3RyaW5nKGQudCk7XG5cdFx0fSlcblx0O1xuXG5cdC8vIE1vdmUgdGhlIHN1bXMgcm93IHRvIHRoZSBib3R0b20gb2YgdGhlIHRhYmxlXG5cdHN1bXNBY3Rpdml0aWVzVGFibGUubm9kZSgpLmFwcGVuZENoaWxkKHN1bXNSb3cubm9kZSgpKTtcblxuXG5cdHVwZGF0ZUNoZWNrYm94U3VtcygpO1xufTtcblxuXG5cbnZhciBjcmVhdGVDaGVja2JveGVzID0gZnVuY3Rpb24oKSB7XG5cdHZhciByb3cgPSBkMy5zZWxlY3QodGhpcyk7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbkNoZWNrYm94ZXNQZXJSb3c7IGkrKykge1xuXHRcdHJvd1xuXHRcdFx0LmFwcGVuZCgndGQnKVxuXHRcdFx0LmNsYXNzZWQoJ2NoZWNrYm94JywgdHJ1ZSlcblx0XHRcdC5vbignY2xpY2snLCBmdW5jdGlvbihkLGkpIHtcblx0XHRcdFx0dG9nZ2xlQ2hlY2tib3guYmluZCh0aGlzKShkLGkpO1xuXHRcdFx0XHR1cGRhdGVDaGVja2JveFN1bXMuYmluZCh0aGlzKShkLGkpO1xuXHRcdFx0fSlcblx0XHQ7XG5cdH1cbn07XG5cbnZhciB0b2dnbGVDaGVja2JveCA9IGZ1bmN0aW9uKGQsIGkpIHtcblx0dmFyIGNlbGwgPSBkMy5zZWxlY3QodGhpcyk7XG5cdGNlbGwuY2xhc3NlZCgnY2hlY2tlZCcsICFjZWxsLmNsYXNzZWQoJ2NoZWNrZWQnKSk7XG59O1xuXG52YXIgdXBkYXRlQ2hlY2tib3hTdW1zID0gZnVuY3Rpb24oKSB7XG5cdHZhciB0VG90YWxzID0gZDMucmFuZ2UobkNoZWNrYm94ZXNQZXJSb3cpO1xuXHR0VG90YWxzID0gdFRvdGFscy5tYXAoZnVuY3Rpb24oKSB7cmV0dXJuIDA7fSk7XG5cblx0c3Vtc0FjdGl2aXRpZXNUYWJsZS5zZWxlY3RBbGwoJy5jaGVja2JveC1yb3cnKVxuXHRcdC5lYWNoKGZ1bmN0aW9uKGQxLCBpMSkge1xuXHRcdFx0dmFyIGNoZWNrYm94ZXMgPSBkMy5zZWxlY3QodGhpcykuc2VsZWN0QWxsKCcuY2hlY2tib3gnKTtcblx0XHRcdGNoZWNrYm94ZXNcblx0XHRcdFx0LmVhY2goZnVuY3Rpb24oZDIsIGkyKSB7XG5cdFx0XHRcdFx0aWYgKGQzLnNlbGVjdCh0aGlzKS5jbGFzc2VkKCdjaGVja2VkJykpXHR7XG5cdFx0XHRcdFx0XHR0VG90YWxzW2kyXSArPSBkMS50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdDtcblx0XHR9KVxuXHQ7XG5cblx0dmFyIHN1bUNlbGxzID0gc3Vtc0FjdGl2aXRpZXNUYWJsZS5zZWxlY3RBbGwoJ3RkLnN1bScpO1xuXHRzdW1DZWxsc1xuXHRcdC5kYXRhKHRUb3RhbHMpXG5cdFx0Lmh0bWwoZnVuY3Rpb24oZCkge1xuXHRcdFx0cmV0dXJuIHRpbWVNb2R1bGUuZHVyYXRpb25Nc1RvU3RyaW5nKGQpLnNwbGl0KFwiIFwiKS5qb2luKFwiPGJyPlwiKTtcblx0XHR9KVxuXHQ7XG59O1xuXG5cbmV4cG9ydHMudXBkYXRlRGlzcGxheSA9IHVwZGF0ZURpc3BsYXk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL3N1bXMtbW9kdWxlLmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHRpbWVNb2R1bGUgPSByZXF1aXJlKCcuL3RpbWUtbW9kdWxlJyk7XG5cbnZhciBjID0gXCI8Y29tbWVudD5cIjtcblxuZGF0YSA9IFtdO1xuXG5kYXRhLnB1c2goW1xuXHR7dDogdGltZU1vZHVsZS5ub3coKSwgaTogMCwgYzogY30sXG5dKTtcblxuXG5kYXRhLnB1c2goW1xuXHR7dDogMTQzMDk4MDMzMjgzNywgaTogMiwgYzogY30sXG5cdHt0OiAxNDMwOTgxMzYwNDM0LCBpOiAyLCBjOiBjfSxcblx0e3Q6IDE0MzA5ODkzMDA5NTYsIGk6IDEsIGM6IGN9LFxuXHR7dDogMTQzMDk5Mjk0NDI1NCwgaTogMCwgYzogY30sXG5cdHt0OiAxNDMwOTk1OTMzNjI3LCBpOiAzLCBjOiBjfSxcblx0e3Q6IDE0MzEwMDM1NDAwMDAsIGk6IDAsIGM6IGN9LFxuXHR7dDogMTQzMTAwNDgwODMyOSwgaTogMiwgYzogY30sXG5cdHt0OiAxNDMxMDEwNjAwMjM5LCBpOiAxLCBjOiBjfSxcbl0pO1xuXG5kYXRhLnB1c2goW1xuXHR7dDogMTQzMTM2ODkyMzUzNCwgaTogMCwgYzogY30sXG5cdHt0OiAxNDMxMzY4OTI5NTM0LCBpOiAwLCBjOiBjfSxcbl0pO1xuXG5kYXRhLnB1c2goW1xuXHR7dDogIDEwMDAsIGk6IDAsIGM6IGN9LFxuXHR7dDogIDkwMDAsIGk6IDAsIGM6IGN9LFxuXHR7dDogMjAwMDAsIGk6IDEsIGM6IGN9LFxuXHR7dDogNDkwMDAsIGk6IDIsIGM6IGN9LFxuXHR7dDogNTQwMDAsIGk6IDAsIGM6IGN9LFxuXSk7XG5cbnZhciBwcm9jZXNzRGF0YSA9IGZ1bmN0aW9uKGRhdGEpIHtcblx0dmFyIHQgPSB0aW1lTW9kdWxlLm5vdygpO1xuXHR2YXIgdExhc3QgPSBkYXRhW2RhdGEubGVuZ3RoLTFdLnQ7XG5cdHJldHVybiBkYXRhLm1hcChmdW5jdGlvbihpdGVtKSB7XG5cdFx0aXRlbS50ICs9IHQgLSB0TGFzdDtcblx0XHRyZXR1cm4gaXRlbTtcblx0fSk7XG59XG5cbnZhciBnZW5lcmF0ZU5hbWVzID0gZnVuY3Rpb24oZGF0YSkge1xuXHR2YXIgaUFsbCA9IHt9O1xuXHRkYXRhLmZvckVhY2goZnVuY3Rpb24oaXRlbSkge1xuXHRcdGlmICghKGl0ZW0uaSBpbiBpQWxsKSkgaUFsbFtpdGVtLmldID0gMDtcblx0fSlcblx0dmFyIG5hbWVzID0gT2JqZWN0LmtleXMoaUFsbCkubWFwKGZ1bmN0aW9uKGl0ZW0sIGluZGV4KSB7XG5cdFx0cmV0dXJuIFwiQWN0aXZpdHlcIiArIGluZGV4O1xuXHR9KTtcblx0cmV0dXJuIG5hbWVzO1xufTtcblxudmFyIGdldCA9IGZ1bmN0aW9uKG4pIHtcblx0aWYgKG4gPT09IHVuZGVmaW5lZCkgbiA9IDA7XG5cblx0cmV0dXJuIHtcblx0XHRkYXRhOiBwcm9jZXNzRGF0YShkYXRhW25dKSxcblx0XHRhY3Rpdml0eU5hbWVzOiBnZW5lcmF0ZU5hbWVzKGRhdGFbbl0pXG5cdH1cbn07XG5cblxuZXhwb3J0cy5nZXQgPSBnZXQ7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL3Rlc3QtZGF0YS5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBub3cgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG59O1xuXG52YXIgc3VtID0gZnVuY3Rpb24gKGludGVydmFscywgYWN0aXZpdHlOYW1lcykge1xuXHR2YXIgc3VtcyA9IGFjdGl2aXR5TmFtZXMubWFwKGZ1bmN0aW9uICgpIHsgcmV0dXJuIDA7IH0pO1xuXHRpbnRlcnZhbHMuZm9yRWFjaChmdW5jdGlvbiAoaW50ZXJ2YWwpIHtcblx0XHRzdW1zW2ludGVydmFsLmldICs9IGludGVydmFsLnQyIC0gaW50ZXJ2YWwudDE7XG5cdH0pO1xuXG5cdC8vIFJldHVybiBhcnJheSBvZiBpbmRpY2VzIGFuZCBkdXJhdGlvbnNcblx0cmV0dXJuIHN1bXMubWFwKGZ1bmN0aW9uIChzdW0sIGkpIHtcblx0XHRyZXR1cm4geyBpOiBpLCB0OiBzdW0gfTtcblx0fSk7XG59O1xuXG4vLyBtaWxsaXNlY29uZHMgdG8gaG91cnNcbnZhciBtczJoID0gZnVuY3Rpb24obXMpIHtcblx0cmV0dXJuIG1zLzM2MDAwMDA7XG59O1xuXG52YXIgZHVyYXRpb25Nc1RvU3RyaW5nID0gZnVuY3Rpb24obXMpIHtcblx0cmV0dXJuIG1zMmhxKG1zKSArICcgKCcgKyBtczJoKG1zKS50b0ZpeGVkKDQpICsgJykgaCdcbn07XG5cbi8vIG1pbGxpc2Vjb25kcyB0byBob3VycyByb3VuZGVkIHRvIG5lYXJlc3QgcXVhcnRlclxudmFyIG1zMmhxID0gZnVuY3Rpb24obXMpIHtcblx0cmV0dXJuIHF1YW50aXplKG1zMmgobXMpLCAwLjI1KS50b0ZpeGVkKDIpO1xufTtcblxuLy8gcm91bmQgaG91cnMgdG8gbmVhcmVzdCBxdWFydGVyIGhvdXJcbnZhciBxdWFudGl6ZSA9IGZ1bmN0aW9uKG51bWJlciwgcXVhbnRhKSB7XG5cdHJldHVybiBNYXRoLnJvdW5kKG51bWJlci9xdWFudGEpKnF1YW50YTtcbn07XG5cbnZhciB0aW1lTXMySGhtbSA9IGZ1bmN0aW9uKG1zKSB7XG5cdHZhciBkYXRlID0gbmV3IERhdGUobXMpO1xuXHRyZXR1cm4gZGF0ZS50b1RpbWVTdHJpbmcoKS5zbGljZSgwLDUpO1xufTtcblxuZXhwb3J0cy5zdW0gPSBzdW07XG5leHBvcnRzLm5vdyA9IG5vdztcbmV4cG9ydHMubXMyaCA9IG1zMmg7XG5leHBvcnRzLnRpbWVNczJIaG1tID0gdGltZU1zMkhobW07XG5leHBvcnRzLmR1cmF0aW9uTXNUb1N0cmluZyA9IGR1cmF0aW9uTXNUb1N0cmluZztcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvdGltZS1tb2R1bGUuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5BcnJheS5wcm90b3R5cGUubGFzdCA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gdGhpc1t0aGlzLmxlbmd0aCAtIDFdO1xufTtcblxuZXhwb3J0cy5jb21wb3NlID0gZnVuY3Rpb24gKGZ1bmMxLCBmdW5jMikge1xuXHRyZXR1cm4gZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIGZ1bmMxKGZ1bmMyLmFwcGx5KG51bGwsIGFyZ3VtZW50cykpO1xuXHR9O1xufTtcblxuZXhwb3J0cy5jbGFtcCA9IGZ1bmN0aW9uICh4LCBhLCBiKSB7XG5cdGEgPSBhIHx8IC1JbmZpbml0eTtcblx0YiA9IGIgfHwgSW5maW5pdHk7XG5cblx0Y29uc29sZS5sb2coeCxhLGIpO1xuXHRyZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgoYSx4KSxiKTtcbn07XG5cbmV4cG9ydHMuc2V0SW50ZXJ2YWxOb3cgPSBmdW5jdGlvbiAoZnVuYykge1xuXHR2YXIgYXJnc0ZvckZ1bmMgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cykuc2xpY2UoMik7XG5cdGZ1bmMuYXBwbHkobnVsbCwgYXJnc0ZvckZ1bmMpO1xuXHRyZXR1cm4gc2V0SW50ZXJ2YWwuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbn07XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL3V0aWwuanNcIixcIi9cIikiXX0=
