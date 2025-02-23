const name = 'receive_state'
const crypto = require('crypto')
const bl = require('bl')
const loner = require('loner')
const debug = require('debug')(name)

const server = require('./server')

const config = require('rc')(name, {
  boundary: '---',
  socketPath: null
})

main()

async function main() {
  if (config._.length == 1) {
    const [cmd] = config._
    if (cmd == 'parse') {
      try {
        await parse(process.stdin, process.stdout)
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
            await parse(process.stdin, process.stdout)
          } catch(err) {
            console.error(err.message)
          }
        })
      } catch(err) {
        console.error(err.message)
        process.exit(1)
      }
    }
  }
}

function parse(stdin, stdout) {
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
    
    stdin.pipe(loner('\r\n', config.boundary)).on('end', ()=>{
      parseFooter(footer)
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
        reject(err)
      }
    })

    function addKeyValue(o, line) {
      let [k, ...v] = line.trim().split('=')
      v = v.join('=')
      o[k] = v
    }

    function send(chunk) {
      stdout.write(chunk)
      hash.update(chunk)
    }

    function parseHeader(header) {
      console.log('header', header)
      if (header.boundary !== boundary.toString()) {
        throw new Error(`boundary must be ${boundary}`)
      }
    }

    function parseFooter(footer) {
      console.log('footer:', footer)
      const ourHash = hash.digest('hex')
      console.log('our hash:', ourHash)
      if (footer.sha256 == ourHash) {
        return resolve()
      }
      reject(new Error('sha256 mismatch'))
    }
  })
}
