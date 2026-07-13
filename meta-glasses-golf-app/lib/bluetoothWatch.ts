import { WatchConnectionState, WatchTelemetry } from './types'

// Golf watch makers (Garmin, Coros, Shot Scope, ...) expose hole/pin-distance data
// only through their own closed apps/APIs — there is no open BLE GATT standard for
// it. What Web Bluetooth *can* talk to on real hardware is the standard GATT
// `heart_rate` and `battery_service` profiles that most sport watches broadcast.
// So a real connection here streams live heart rate + battery from the watch,
// while hole/pin-distance telemetry comes from Demo Mode (or manual entry in the
// Round tab) until a vendor SDK partnership is in place.

type TelemetryListener = (t: Partial<WatchTelemetry>) => void
type StateListener = (s: WatchConnectionState) => void

class GolfWatchLink {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private state: WatchConnectionState = 'disconnected'
  private telemetryListeners = new Set<TelemetryListener>()
  private stateListeners = new Set<StateListener>()
  private demoTimer: ReturnType<typeof setInterval> | null = null
  private demoHole = 1
  private demoDistance = 165

  get connectionState() {
    return this.state
  }

  onTelemetry(cb: TelemetryListener) {
    this.telemetryListeners.add(cb)
    return () => this.telemetryListeners.delete(cb)
  }

  onStateChange(cb: StateListener) {
    this.stateListeners.add(cb)
    return () => this.stateListeners.delete(cb)
  }

  isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth
  }

  async connectReal(): Promise<void> {
    if (!this.isWebBluetoothSupported()) {
      this.setState('error')
      throw new Error(
        '이 브라우저는 Web Bluetooth를 지원하지 않습니다. Android Chrome에서 열어주세요.'
      )
    }

    this.setState('connecting')
    try {
      this.device = await navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['heart_rate', 'battery_service'],
      })
      this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnect())
      this.server = (await this.device.gatt?.connect()) ?? null
      if (!this.server) throw new Error('GATT 서버에 연결하지 못했습니다.')

      this.setState('connected')
      this.emit({ updatedAt: Date.now() })

      await this.subscribeHeartRate()
      await this.readBattery()
    } catch (err) {
      this.setState('error')
      throw err
    }
  }

  private async subscribeHeartRate() {
    if (!this.server) return
    try {
      const service = await this.server.getPrimaryService('heart_rate')
      const characteristic = await service.getCharacteristic('heart_rate_measurement')
      await characteristic.startNotifications()
      characteristic.addEventListener('characteristicvaluechanged', () => {
        const value = characteristic.value
        if (!value) return
        const flags = value.getUint8(0)
        const is16Bit = (flags & 0x1) !== 0
        const heartRate = is16Bit ? value.getUint16(1, true) : value.getUint8(1)
        this.emit({ heartRate, updatedAt: Date.now() })
      })
    } catch {
      // Watch doesn't expose a standard heart-rate service — not fatal, HUD just
      // won't show a live heart rate for this device.
    }
  }

  private async readBattery() {
    if (!this.server) return
    try {
      const service = await this.server.getPrimaryService('battery_service')
      const characteristic = await service.getCharacteristic('battery_level')
      const value = await characteristic.readValue()
      this.emit({ batteryPercent: value.getUint8(0), updatedAt: Date.now() })
    } catch {
      // Not exposed — ignore.
    }
  }

  private handleDisconnect() {
    this.device = null
    this.server = null
    this.setState('disconnected')
  }

  disconnect() {
    this.stopDemo()
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.device = null
    this.server = null
    this.setState('disconnected')
  }

  startDemo() {
    this.stopDemo()
    this.demoHole = 1
    this.demoDistance = 165
    this.setState('demo')
    this.tickDemo()
    this.demoTimer = setInterval(() => this.tickDemo(), 3000)
  }

  stopDemo() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer)
      this.demoTimer = null
    }
  }

  private tickDemo() {
    this.demoDistance -= Math.round(8 + Math.random() * 20)
    let lastShotDistance: number | null = null
    if (this.demoDistance <= 5) {
      lastShotDistance = 165 - this.demoDistance
      this.demoHole = this.demoHole >= 18 ? 1 : this.demoHole + 1
      this.demoDistance = 120 + Math.round(Math.random() * 80)
    }
    this.emit({
      holeNumber: this.demoHole,
      distanceToPinCenter: Math.max(this.demoDistance, 0),
      distanceToPinFront: Math.max(this.demoDistance - 6, 0),
      distanceToPinBack: this.demoDistance + 6,
      lastShotDistance,
      heartRate: 95 + Math.round(Math.random() * 25),
      batteryPercent: 78,
      updatedAt: Date.now(),
    })
  }

  private setState(next: WatchConnectionState) {
    this.state = next
    this.stateListeners.forEach((cb) => cb(next))
  }

  private emit(telemetry: Partial<WatchTelemetry>) {
    this.telemetryListeners.forEach((cb) => cb(telemetry))
  }
}

export const golfWatchLink = new GolfWatchLink()
