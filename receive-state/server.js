const fs = require('fs')
const os = require('os')
const net = require('net')
const debug = require('debug')('receive_state:server')

module.exports = function (socketPath, onConnection) {
  return new Promise( (resolve, reject) => {
    //fs.mkdtempSync(join(os.tmpdir(), 'unix-socket'))
    const server = net.createServer({
      path: socketPath
    }, stream => {
      debug('incoming conncetion')
      onConnection(stream)
    })
    server.listen(socketPath, err => {
      if (!err) {
        const mode = 0o770;
        fs.chmodSync(socketPath, mode)
        debug('listening on socket %s', socketPath)
        return resolve()
      }
      console.error(err.message)
      reject(err)
    })

    server.on('error', err => {
      console.error("socket: %s, error: %s", socketPath, err.message)
      reject(err)
    })
  })
}
