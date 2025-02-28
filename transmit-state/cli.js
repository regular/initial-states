const name = 'transmit_state'
const debug = require('debug')(name)
const pull = require('pull-stream')
const { stdin, stdout, stderr } = require('pull-stdio')
const client = require('pull-unix')

const config = require('rc')(name, {
  socketPath: 'sock'
})

debug('config: %O', config)

pull(
  stdin({encoding: false}),
  //pull.through(x=>console.log(x.length)),
  client({path: config.socketPath}),
  pull.collect( (err, buffers)=>{
    const result = Buffer.concat(buffers).toString()
    const first = result.split(' ')[0]
    console.log('receive-initial-state says:')
    process.stdout.write(result)
    if (first !== 'ok') {
      process.exit(1)
    } else console.log('Success!')
  })
)

