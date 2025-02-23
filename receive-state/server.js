const fs = require('fs')
const os = require('os')
const net = require('net')
const debug = require('debug')('receive_state:server')
const once = require('once')

module.exports = function (socketPath, cb) {
  cb = once(cb)
  //fs.mkdtempSync(join(os.tmpdir(), 'unix-socket'))
  const server = net.createServer({
    path: socketPath
  }, stream => {
    debug('incoming conncetion')
    onConnection(stream)
  })
  server.listen(socketPath, err => {
    if (!err) {
        const mode = 0770;
        fs.chmodSync(socketPath, mode)
      }
      debug('listening on socket %s', opts.path)
    }
    cb(err)
  })

  server.on('error', err => {
    debug("socket: %s, error: %s", opts.path, err.message)
    cb(err)
  })
}
