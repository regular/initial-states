// TODO: when tar fails, we get an exception,
// but we tell the socket client that everything is ok
// for some reason, sending data to the socket
// from the exceptionn handler has no effect ...
// A timing issue?


const name = 'receive_state'
const crypto = require('crypto')
const bl = require('bl')
const loner = require('loner')
const debug = require('debug')(name)

const server = require('./server')
const Scripts = require('./scripts')
const assertDeps = require('./assert-deps')

const config = require('rc')(name, {
  boundary: '---',
})


debug('config: %O', config)

let shell
try {
  shell = assertDeps(process.env.PATH, Scripts.deps)
} catch(err) {
  console.error(err.message)
  process.exit(1)
}

const {
  untar
} = Scripts({
  PATH: process.env.PATH,
  shell
})

main()

async function main() {
  if (config._.length == 1) {
    const [cmd] = config._
    if (cmd == 'parse') {
      try {
        await parse(process.stdin, process.stdout, process.stderr, process.stderr)
      } catch(err) {
        console.error(err.message)
        process.exit(1)
      }
    } else if (cmd == 'server') {
      const {socketPath} = config
      if (!socketPath) {
        console.error('missing --socketPath')
        process.exit(1)
      }
      try {
        await server(socketPath, async stream=>{
          try {
            const untar_promise = untar('/tmp/foobar')
            const untar_in = untar_promise.stdin
            const [sha, tar_result] = await Promise.all([
              parse(stream, stream, untar_in, process.stderr),
              untar_promise
            ])
            console.error('xxx', {sha, tar_result})
            console.error('received initial state')
          } catch(err) {
            console.error('session abort:', err.message)
            // this does not work
            stream.write(`error ${err.message}\r\n`)
            stream.end()
          }
        })
      } catch(err) {
        console.error(err.message)
        process.exit(1)
      }
    }
  }
}

function parse(clientin, clientout, hostout, logout) {
  let failed = false
  return new Promise( (resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const boundary = Buffer.from(config.boundary)
    let wasCRLF = false
    let suppressedCRLF = false
    let suppressedBoundary = false
    let wasBoundary = false
    let wasInPayloal = false
    let inHeader = true
    let inPayload = false
    let inFooter = false
    const header = {}
    const footer = {}
    let line = bl()
    
    clientin.pipe(loner('\r\n', config.boundary)).on('end', ()=>{
      try {
        parseFooter(footer)
      } catch(err) {
        handleError(err)
      }
    }).on('error', err=>{
      handleError(err)
    }).on('data', chunk=>{
      try {
        debug('in', chunk)
        const isCRLF = chunk.length == 2 && chunk[0] == 0x0d && chunk[1] == 0x0a
        let isBoundary = false

        if (inFooter) {
          if (isCRLF) {
            addKeyValue(footer, line.toString())
            line = new bl()
          }
          line.append(chunk)
        } else if (inPayload) {
          if (isCRLF && wasBoundary) {
            inPayload = false
            inFooter = true
          } else if (wasBoundary && suppressedBoundary) {
            debug('boundary in payload without preceeding CRLF')
            suppressedBoundary = false
            send(boundary)
          } else {
            isBoundary = wasCRLF && chunk.length == boundary.length && chunk.compare(boundary) == 0
              
            if (wasCRLF && suppressedCRLF && !isBoundary) {
              debug('send previosule supressed CRLF')
              suppressedCRLF = false
              send(Buffer.from('\r\n'))
            }
            if (isCRLF) {
              suppressedCRLF = true
            } else if (isBoundary) {
              suppressedBoundary = true;
            } else {
              send(chunk)
            } 
          }
        } else if (inHeader) {
          if (isCRLF && wasCRLF) {
            inHeader = false
            inPayload = true
            parseHeader(header)
          } else {
            if (isCRLF) {
              addKeyValue(header, line.toString())
              line = new bl()
            }
            line.append(chunk)
          }
        }

        wasCRLF = isCRLF
        wasBoundary = isBoundary
        wasInPayloal = inPayload
      } catch(err) {
        handleError(err)
      }
    })

    function handleError(err) {
      clientout.write(`error ${err.message}\r\n`)
      //clientout.end()
      logout.write(`${err.message}\n`)
      failed = true
      reject(err)
    }

    function addKeyValue(o, line) {
      let [k, ...v] = line.trim().split('=')
      v = v.join('=')
      o[k] = v
    }

    function send(chunk) {
      if (failed) return
      hostout.write(chunk)
      hash.update(chunk)
    }

    function parseHeader(header) {
      debug('header %O', header)
      if (header.boundary !== boundary.toString()) {
        throw new Error(`boundary must be ${boundary}`)
      }
    }

    function parseFooter(footer) {
      if (failed) return
      debug('footer: %O', footer)
      const ourHash = hash.digest('hex')
      debug('our hash: %s', ourHash)
      if (footer.sha256 == ourHash) {
        clientout.write('ok sha256 match\r\n')
        hostout.end()
        return resolve(ourHash)
      }
      throw new Error('sha256 mismatch')
    }
  })
}
