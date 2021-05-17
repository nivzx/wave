// Copyright 2020 H2O.ai, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { B, box, boxed, ChangeSet, connect, Dict, Disposable, on, Rec, U, Wave, WaveEvent, WaveEventType } from 'h2o-wave'
import * as React from 'react'

//
// React Component + Dataflow
//

interface Renderable {
  render(): JSX.Element
  init?(): void
  update?(): void
  dispose?(): void
}

export function bond<TProps, TState extends Renderable>(ctor: (props: TProps) => TState) {
  return class extends React.Component<TProps> {
    private readonly model: TState
    private readonly arrows: Disposable[]
    constructor(props: TProps) {
      super(props)

      const
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        self = this,
        model = ctor(props),
        arrows: Disposable[] = []

      Object.keys(model).forEach(k => {
        if (k === 'render' || k === 'dispose' || k === 'init' || k === 'update') return
        const v = (model as any)[k]
        if (boxed(v)) arrows.push(on(v, _ => self.setState({})))
      })

      this.model = model
      this.arrows = arrows
      this.state = {}
    }
    componentDidMount() {
      if (this.model.init) this.model.init()
    }
    componentDidUpdate() {
      if (this.model.update) this.model.update()
    }
    componentWillUnmount() {
      if (this.model.dispose) this.model.dispose()
      for (const a of this.arrows) a.dispose()
    }
    render() {
      return this.model.render()
    }
  }
}

let _wave: Wave | null = null

const
  args: Rec = {},
  events: Rec = {},
  clearRec = (a: Rec) => {
    for (const k in a) delete a[k]
  }

export
  const jump = (key: any, value: any) => {
    if (value.startsWith('#')) {
      window.location.hash = value.substr(1)
      return
    }
    if (key) {
      wave.args[key] = value
    } else {
      wave.args[value] = true
    }
    wave.push()
  },
  debounce = (timeout: U, f: (e: any) => void) => {
    let t: number | null = null
    return (e: any) => {
      if (t) window.clearTimeout(t)
      t = window.setTimeout(() => (f(e), t = null), timeout)
    }
  },
  contentB = box<WaveEvent | null>(null),
  argsB = box<any>({}),
  busyB = box<B>(false),
  config = {
    username: '',
    editable: false,
  },
  listen = () => {
    _wave = connect(e => {
      switch (e.t) {
        case WaveEventType.Receive:
        case WaveEventType.Error:
        case WaveEventType.Exception:
        case WaveEventType.Disconnect:
          contentB(e)
          break
        case WaveEventType.Reset:
          window.location.reload()
          break
        case WaveEventType.Config:
          config.username = e.username
          config.editable = e.editable
          break
        case WaveEventType.Send:
          argsB(e.data)
          break
        case WaveEventType.Busy:
          busyB(true)
          break
        case WaveEventType.Free:
          busyB(false)
          break
      }
    })
  },
  wave = {
    args,
    events,
    push: () => {
      if (!_wave) return
      const data: Dict<any> = { ...args }
      clearRec(args)
      if (Object.keys(events).length) {
        data[''] = { ...events }
        clearRec(events)
      }
      _wave.push(undefined, data)
    },
    fork: (): ChangeSet => {
      if (!_wave) throw new Error('not initialized')
      return _wave.fork()
    }
  }
