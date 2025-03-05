const name = 'receive_state'
const fs = require('fs')
const fsp = fs.promises
const crypto = require('crypto')
const {join} = require('path')
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
  untar,
  move
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
      const {socketPath, statePath, tmpPath} = config
      if (!socketPath) {
        console.error('missing --socketPath')
        process.exit(1)
      }
      if (!statePath) {
        console.error('missing --statePath')
        process.exit(1)
      }
      if (!tmpPath) {
        console.error('missing --tmpPath')
        process.exit(1)
      }
      try {
        if (await checkRequiredFiles()) {
          debug("We have all required files.")
          process.exit(0)
        }
        
        await server(socketPath, handleStream)
        
        async function handleStream(stream) {
          try {
            await withTmpDir(tmpPath, async path =>{
              try {
                await untarAndVerify(stream, path)
                await fsp.mkdir(statePath)
                await move(path, statePath)
              } catch(err) {
                if (err.message == "sha256 mismatch") {
                  console.error('Failed attempt to send initial state, will keep listenting')
                } else throw err
              }
            })
          } catch(err) {
            if (err.message.includes(`rmdir '${tmpPath}`)) {
              console.error('${path} dir was moved')
            } else throw err
          }
          if (!config.keep && await checkRequiredFiles()) setImmediate(()=>process.exit(0))
        }

      } catch(err) {
        console.error(err.message)
        debug(err.stack)
        process.exit(1)
      }
    }
  }
}

async function checkRequiredFiles() {
  // return true if all files exist withi statePath
  if (!config.requiredFile) return true
  const paths = [config.requiredFile].flat()
  if (paths.length == 0) return
  const results = await Promise.all(paths.map(async p=>{
    const full = join(config.statePath, p)
    try {
      await fs.promises.access(full)
      return true
    } catch(err) {
      console.error('missing required file %s: %s', full, err.message)
      return false
    }
  }))
  return results.every(x=>x==true)
}


function untarAndVerify(stream, statePath) {
  return new Promise( async (resolve, reject) =>{
    try {
      // untar to tempo directory and mv to statePath
      // only if successful!
      // Otherwise, even if a sha mismatch occured, the next start of the
      // service might happily find all required files and move on!

      const untar_promise = untar(statePath)
      const untar_in = untar_promise.stdin
      const [sha, tar_result] = await Promise.all([
        parse(stream, stream, untar_in, process.stderr),
        untar_promise
      ])
      const {exitCode, stderr} = tar_result
      if (exitCode !== 0) throw new Error(`tar failed with code ${exitCode}: ${stderr}`)
      console.error(`wrote initial state to ${statePath}`)
      stream.write(`ok ${sha}\r\n`)
      stream.end()
      resolve()
    } catch(err) {
      console.error('abort:', err.message)
      stream.write(`error ${err.message}\r\n`)
      stream.end()
      reject(err)
    }
  })
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
        console.error('Error in parseFooter')
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
      //clientout.write(`error ${err.message}\r\n`)
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
        //clientout.write('ok sha256 match\r\n')
        hostout.end()
        return resolve(ourHash)
      }
      throw new Error('sha256 mismatch')
    }
  })
}

// --

async function withTmpDir(parentDir, f) {
  const random = crypto.randomBytes(8).toString('hex')
  const path = join(parentDir, random)
  debug('Creating tmp dir at %s', path)
  await fsp.mkdir(path, {recursive: true})
  try {
    return await f(path)
  } finally {
    debug('Removing tmp dir at %s', path)
    fsp.rm(path, {recursive: true, force: true})
  }
}
