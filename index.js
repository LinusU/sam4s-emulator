const fs = require('fs')
const net = require('net')
const { Canvas } = require('canvas')

function rasterBitmapToPng (w, h, buffer) {
  const canvas = new Canvas(w * 8, h)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'white'

  ctx.fillRect(0, 0, w * 8, h)

  ctx.fillStyle = 'black'

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (buffer[(y * w) + x] & 0x01) ctx.fillRect((x * 8) + 7, y, 1, 1)
      if (buffer[(y * w) + x] & 0x02) ctx.fillRect((x * 8) + 6, y, 1, 1)
      if (buffer[(y * w) + x] & 0x04) ctx.fillRect((x * 8) + 5, y, 1, 1)
      if (buffer[(y * w) + x] & 0x08) ctx.fillRect((x * 8) + 4, y, 1, 1)
      if (buffer[(y * w) + x] & 0x10) ctx.fillRect((x * 8) + 3, y, 1, 1)
      if (buffer[(y * w) + x] & 0x20) ctx.fillRect((x * 8) + 2, y, 1, 1)
      if (buffer[(y * w) + x] & 0x40) ctx.fillRect((x * 8) + 1, y, 1, 1)
      if (buffer[(y * w) + x] & 0x80) ctx.fillRect((x * 8) + 0, y, 1, 1)
    }
  }

  return canvas.toBuffer('image/png')
}

class SocketBuffer {
  constructor (socket) {
    this.socket = socket
    this.buffer = []
    this.queue = []

    socket.on('data', (data) => {
      for (const byte of data) {
        if (this.queue.length) {
          this.queue.shift()(data)
        } else {
          this.buffer.push(byte)
        }
      }
    })
  }

  byte () {
    if (this.buffer.length) {
      return Promise.resolve(this.buffer.shift())
    } else {
      return new Promise(resolve => this.queue.push(resolve))
    }
  }
}

async function handleClient (socket) {
  const buffer = new SocketBuffer(socket)

  while (true) {
    const first = await buffer.byte()
    if (first === 0) {
      continue
    }

    if (first === 0x1e) {
      console.log('Beep the buzzer')
      continue
    }

    const second = await buffer.byte()
    const cmd = Buffer.from([first, second]).toString('hex')
    console.log(`Processing command: ${cmd}`)

    if (cmd === '1b21') {
      const n = await buffer.byte()
      const font = (n & 0x01) ? 'B' : 'A'
      const emphasize = Boolean(n & 0x08)
      const doubleHeight = Boolean(n & 0x10)
      const doubleWidth = Boolean(n & 0x20)
      const underline = Boolean(n & 0x80)
      console.log(`Select print modes:\n  font: ${font}\n  Emphasized mode: ${emphasize ? 'selected' : 'not selected'}\n  Double-height mode: ${doubleHeight ? 'selected' : 'not selected'}\n  Double-width mode: ${doubleWidth ? 'selected' : 'not selected'}\n  Underline mode: ${underline ? 'selected' : 'not selected'}`)
    }

    if (cmd === '1b40') {
      console.log(`Clear the data in the print buffer and reset the printer mode to the mode that was in effect when the power was turned on.`)
    }

    if (cmd === '1b4a') {
      const n = await buffer.byte()
      console.log(`Print the data in the print buffer and feeds the paper [${n} × vertical or horizontal motion unit] inches unit.`)
    }

    if (cmd === '1b52') {
      const n = await buffer.byte()
      const charatcherSet = ['U.S.A.', 'France', 'Germany', 'U.K.', 'Denmark I', 'Sweden', 'Italy', 'Spain', 'Japan', 'Norway', 'Denmark II', 'Spain II', 'Latin America', 'Korea'][n]
      console.log(`Select an international character set "${charatcherSet}".`)
    }

    if (cmd === '1d42') {
      const n = await buffer.byte()
      console.log(`Turn ${n === 0 ? 'off' : 'on'} white/black reverse printing mode.`)
    }

    if (cmd === '1b63') {
      await buffer.byte()
      await buffer.byte()
    }

    if (cmd === '1b74') {
      const n = await buffer.byte()
      console.log(`Select a page ${n} from the character code table.`)
    }

    if (cmd === '1d50') {
      const x = await buffer.byte()
      const y = await buffer.byte()
      console.log(`Set the horizontal and vertical motion unit to x=${x} y=${y}.`)
    }

    if (cmd === '1d56') {
      const m = await buffer.byte()
      if (m === 0 || m === 1 || m === 49) {
        console.log(`Select a mode for cutting paper and executes paper cutting: Partial Cut`)
      } else {
        const n = await buffer.byte()
        console.log(`Select a mode for cutting paper and executes paper cutting: Feed Paper ${n}`)
      }
    }

    if (cmd === '1d61') {
      const n = await buffer.byte()
      const drawerKickOut = Boolean(n & 0x01)
      const onlineOffline = Boolean(n & 0x02)
      const errorStatus = Boolean(n & 0x04)
      const paperSensor = Boolean(n & 0x08)
      console.log(`Enable or disable ASB and specifies the status items to include:\n  Drawer kick-out connector pin 3 status ${drawerKickOut ? 'enabled' : 'disabled'}\n  On-line/off-line ${onlineOffline ? 'enabled' : 'disabled'}\n  Error status ${errorStatus ? 'enabled' : 'disabled'}\n  Paper roll sensor status ${paperSensor ? 'enabled' : 'disabled'}`)
      socket.write(Buffer.from('14000000ff', 'hex'))
    }

    if (cmd === '1d76') {
      const u1 = await buffer.byte() // should always be 0x30
      const m = await buffer.byte()
      const xL = await buffer.byte()
      const xH = await buffer.byte()
      const yL = await buffer.byte()
      const yH = await buffer.byte()
      const width = (xL + (xH * 256))
      const height = (yL + (yH * 256))
      const k = width * height

      console.log(`u1 = ${u1}\nm = ${m}\nxL = ${xL}\nxH = ${xH}\nyL = ${yL}\nyH = ${yH}\nwidth = ${width}\nheight = ${height}\nk = ${k}`)
      console.log(`Print image (mode=${m}) with size: ${width}x${height}`)

      const img = Buffer.alloc(k)
      for (let i = 0; i < k; i++) {
        img[i] = await buffer.byte()
      }

      const name = `img-${new Date().toISOString().replace(/:/g, '.')}.png`
      fs.writeFileSync(name, rasterBitmapToPng(width, height, img))
      console.log(`Image saved as: ${name}`)
    }
  }
}

const server = net.createServer((socket) => {
  console.log('New connection')

  handleClient(socket)

  socket.on('end', () => {
    console.log('Remote end closed connection')
  })
})

server.listen(6001)
