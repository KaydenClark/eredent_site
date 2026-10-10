// CPU copy of the 16-bit height layer, for the camera (stay above ground) and the HUD.
export class Heightfield {
  constructor(image, window) {
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
    this.data = g.getImageData(0, 0, c.width, c.height).data;
    this.w = c.width; this.h = c.height;
    this.lon0 = window.lon[0]; this.lon1 = window.lon[1]; this.lat0 = window.lat[0]; this.lat1 = window.lat[1];
  }
  // surface height in meters above sea level (0 over the ocean, lake surfaces flat)
  at(lat, lon) {
    if (lon < this.lon0 || lon > this.lon1 || lat < this.lat0 || lat > this.lat1) return 0;
    const u = (lon - this.lon0) / (this.lon1 - this.lon0) * this.w - 0.5;
    const v = (this.lat1 - lat) / (this.lat1 - this.lat0) * this.h - 0.5;   // image row 0 = north
    const x0 = Math.max(0, Math.min(this.w - 2, Math.floor(u))), y0 = Math.max(0, Math.min(this.h - 2, Math.floor(v)));
    const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
    const h = (x, y) => { const i = (y * this.w + x) * 4; return this.data[i] * 256 + this.data[i + 1] - 6000; };
    return (h(x0, y0) * (1 - fx) + h(x0 + 1, y0) * fx) * (1 - fy) + (h(x0, y0 + 1) * (1 - fx) + h(x0 + 1, y0 + 1) * fx) * fy;
  }
}
