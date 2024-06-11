
function _join (xs) { return xs.join('-') }

function memo (g, join=_join) {
  const map = new Map ()

  function f (...xs) {
    const key = join(xs)
    if (map.has(key))
      return map.get(key)
  
    const x = g.apply(this, xs)
    map.set(key, x)
    return x
  }

  return f
}

function track (leaflet, lines, points, rest) {
  this.leaflet    = leaflet
  this.definition = {lines, points, rest}
  this.map        = null
  this.selected   = []
  this.current    = undefined

  this.points     = []
  this.lines      = []
  this.elements   = []
  this.branches   = []
}

const Default = track.default = 'default'

track.from = function (leaflet, lines, points, rest) {
  return new Proxy (new track (leaflet, lines, points, rest), new handler ())
}

function handler () {
  this.methods = {}
}

handler.prototype.get = function (track, key, proxy) {
  if (key in track) {
    const f = track[key]
    if (typeof f === 'function')
      return (...xs) => { f.apply(track, xs); return proxy }
    else
      return f
  }
  else if (key in this.methods)
    return this.methods[key]
  else if (key in track.definition.rest)
    return this.methods[key] = extra(track.definition.rest[key], proxy)
  else if (key in track.definition.lines)
    return this.methods[key] = line(key, proxy, track)
  else
    return undefined
}

function extra (f, proxy) {
  return (...xs) => f(proxy, ...xs)
}

function line (definition, proxy, track) {
  const f = (...xs) => { track._add(definition, Default, ...xs); return proxy }
  return new Proxy (f, { get (f, key) { 
    if (key in f)
      return f[key]
    else if (key in track.definition.points)
      return f[key] = (...xs) => { track._add(definition, key, ...xs); return proxy }
    else
      return undefined
  }})
}

track.prototype.show = function (id, [[lat,lon], z], options) {
  this.map = this.leaflet.map(id)

  this.map.setView([lat, lon], z)
  const tiles = this.leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {detectRetina: true, ...options})
  this.elements.push(tiles)

  setTimeout(() => this._show(), 0)
}

track.prototype.add = function (...xs) {
  this.elements.push(...xs)
}

track.prototype.select = function (xs) {
  this.selected.push(...xs)
}

track.prototype.section = function (s) {
  this.current = s
  const p = this.last
  if (p)
    p.sections.push(s)
}

track.prototype.includes = function (...ss) {
  if (ss.length === 0)
    return true
  else if (this.selected.length === 0) {
    return true
  }
  else
    return ss.some(s => this.selected.indexOf(s) >= 0)
}

track.prototype.branch = function (f) {
  const branch = Object.assign(Object.create(track.prototype), this, {lines:[], elements: [], branches: []})
  f(new Proxy (branch, new handler ()))
  this.branches.push(branch)
}

track.prototype._icon = memo(function (c) {
  return this.leaflet.divIcon({className: c, iconSize: null})
})

track.prototype._add = function (line, point, lat, lon, tit, msg, html, fn) {
  const p = new track.point (this.current, point, lat, lon, tit, msg, html, fn)
  this.points.push(p)
  if (this.points.length > 1)
    this.lines.push(new track.line (this.current, line, this.last.lat, this.last.lon, lat, lon))
  this.last = p
}

track.prototype._show = function () {
  this.elements.forEach(e => e.addTo(this.map))
  this._segments()
  this.points.forEach(p => p.show(this))
}

track.prototype._segments = function () {
  const segments = []
  let last = undefined
  this.lines.filter(line => this.includes(line.section)).forEach(line => {
    if (line.connected(last))
      segments.at(-1).addLatLng([line.lat1, line.lon1])
    else
      segments.push(new this.leaflet.Polyline ([[line.lat0, line.lon0], [line.lat1, line.lon1]], {className: `line section-${line.section} line-${line.type}`}))
    last = line
  })
  segments.forEach(s => s.addTo(this.map))

  this.branches.forEach(b => b._segments())
}

function noop () {}

track.point = function (section, type, lat, lon, tit, msg, html, fn) {
  this.sections = section ? [section] : []
  this.type = type
  this.lat = lat
  this.lon = lon

  this.tit  = tit  || ''
  this.msg  = msg  || ''
  this.html = html || ''
  this.on   = fn   || noop
}

track.point.prototype.show = function (track) {
  if (track.includes(...this.sections)) {
    const m = new track.leaflet.marker ([this.lat, this.lon], {icon: track._icon(`point ${this.sections.map(s => `section-${s}`).join(' ')} point-${this.type}`) })
    if (this.tit)
      m.bindPopup(`<h3>${this.tit}</h3>${this.msg}${this.html}`)
    m.addTo(track.map)
    m.on('popupopen', this.fn)
  }
}

track.line = function (section, type, lat0, lon0, lat1, lon1) {
  this.section = section
  this.type = type
  this.lat0 = lat0
  this.lon0 = lon0
  this.lat1 = lat1
  this.lon1 = lon1
}

track.line.prototype.connected = function (that) {
  return that && that.type === this.type && that.section === this.section && that.lat1 === this.lat0 && that.lon1 === this.lon0
}
