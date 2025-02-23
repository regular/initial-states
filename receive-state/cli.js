const name = 'receive_state'
const bl = require('bl')
const loner = require('loner')
const debug = require('debug')(name)
const config = require('rc')(name, {
  boundary: '---'
})

if (config._.length == 1) {
  const [cmd] = config._
  if (cmd == 'parse') parse(process.stdin, process.stdout)
}

function parse(stdin, stdout) {
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
  })

  function addKeyValue(o, line) {
    let [k, ...v] = line.trim().split('=')
    v = v.join('=')
    o[k] = v
  }

  function send(chunk) {
    stdout.write(chunk)
  }
}

function parseHeader(header) {
  console.log('header', header)
}

function parseFooter(footer) {
  console.log('footer:', footer)
}
