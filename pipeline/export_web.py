"""Step 6: textures for the web build, cut to the land-cluster window of the equirectangular globe
(lat -14..84, lon -84..78) so the terrain renderer gets close to source resolution:
  kiros_region_color_8k.jpg     art/color, 8192 px wide
  kiros_region_height16_4k.png  surface height in meters + 6000 packed as 16 bits: R = high byte, G = low byte (sea level flat, lake surfaces flat)
  kiros_region_mask_4k.png      R = water depth 0..5500 m -> 0..255, G = protected (interior) sea 0..1, B = biome index (land = index not 0 or 4)
  kiros_ocean_2k.png            whole globe: same channels at 2048x1024 for the orbital shader
  kiros_meta.json               + window and encoding values the shaders need
Biome index: 0 ocean, 1 forest (by latitude in the shader), 2 desert, 3 wetland, 4 lake, 5 snow hatch zone, 6 bayou."""
import numpy as np, cv2, json, os
from PIL import Image
from common import CFG, U, build, TEX, DATA

t = np.load(build('terrain.npz')); e = t['elev'].astype(np.float32); land = t['land']; lakes = t['lakes']
desert = t['desert']; wet = t['wet']; bayou = t['bayou']; snowhatch = t['snowhatch']; I = t['interior'].astype(np.float32)
lake_surface = t['lake_surface']
r = np.load(build('remap.npz')); mapx, mapy = r['mapx'], r['mapy']; j0, j1, i0, i1 = r['window']
H, W = e.shape
WE = CFG['web_export']; EW, EH = WE['equirect_w'], WE['equirect_h']
inside = (mapx >= 0) & (mapx < W - 1) & (mapy >= 0) & (mapy < H - 1)


def remap(a, interp=cv2.INTER_LINEAR, border=0):
    return cv2.remap(a, mapx, mapy, interp, borderMode=cv2.BORDER_CONSTANT, borderValue=border)


# surface height (water flat), 16-bit packed
surf = np.where(land, np.maximum(e, 0), 0).astype(np.float32)
surf = np.where(lakes, lake_surface, surf)
hs = np.where(inside, remap(surf), 0)
h16 = np.clip(hs + 6000, 0, 65535).astype(np.uint16)
rw, rh = 4096, int(round((j1 - j0) * 4096 / (i1 - i0)))
h16s = cv2.resize(h16.astype(np.float32), (rw, rh), interpolation=cv2.INTER_AREA).astype(np.uint16)
packed = np.zeros((rh, rw, 3), np.uint8); packed[..., 0] = h16s >> 8; packed[..., 1] = h16s & 255
Image.fromarray(packed).save(os.path.join(TEX, 'kiros_region_height16_4k.png'), optimize=True)

# masks
depth = np.clip(np.where(land, 0, -e), 0, 5500)
depth = np.where(lakes, np.clip(lake_surface - e, 0, 5500), depth)
biome = np.zeros((H, W), np.uint8)
biome[land] = 1; biome[desert] = 2; biome[wet] = 3; biome[bayou] = 6; biome[snowhatch & land] = 5; biome[lakes] = 4
dep = np.where(inside, remap(depth), 5200.0)
intr = np.where(inside, remap(np.clip(I, 0, 1)), 0.0)
bio = np.where(inside, remap(biome, cv2.INTER_NEAREST), 0).astype(np.uint8)
mask = np.zeros((j1 - j0, i1 - i0, 3), np.uint8)   # RGB on purpose: an alpha channel would let browsers discard color data in transparent pixels
mask[..., 0] = np.clip(dep / 5500 * 255, 0, 255).astype(np.uint8)
mask[..., 1] = np.clip(intr * 255, 0, 255).astype(np.uint8)
mask[..., 2] = bio
masks = cv2.resize(mask, (rw, rh), interpolation=cv2.INTER_NEAREST)
Image.fromarray(masks, 'RGB').save(os.path.join(TEX, 'kiros_region_mask_4k.png'), optimize=True)

# regional color crop from the 8k equirect
col = np.asarray(Image.open(os.path.join(TEX, 'kiros_color_8k.jpg')).convert('RGB'))
Image.fromarray(col[j0:j1, i0:i1]).save(os.path.join(TEX, 'kiros_region_color_8k.jpg'), quality=86)

# whole-globe ocean texture for the orbital shader
glob = np.zeros((EH, EW, 3), np.uint8); glob[..., 0] = int(5200 / 5500 * 255)
glob[j0:j1, i0:i1] = mask
glob = cv2.resize(glob, (2048, 1024), interpolation=cv2.INTER_NEAREST)
Image.fromarray(glob, 'RGB').save(os.path.join(TEX, 'kiros_ocean_2k.png'), optimize=True)

meta = json.load(open(os.path.join(DATA, 'kiros_meta.json')))
meta['web'] = {
    'equirect': [EW, EH],
    'window_px': [int(i0), int(j0), int(i1), int(j1)],
    'window_deg': {'lon': [WE['lon_range'][0], WE['lon_range'][1]], 'lat': [WE['lat_range'][0], WE['lat_range'][1]]},
    'height16': {'file': 'textures/kiros_region_height16_4k.png', 'size': [rw, rh], 'encoding': 'meters = R*256 + G - 6000'},
    'mask': {'file': 'textures/kiros_region_mask_4k.png', 'size': [rw, rh], 'R': 'water depth m = R/255*5500', 'G': 'protected sea 0..1', 'B': 'biome index (water = 0 or 4)'},
    'biome_index': {'0': 'ocean', '1': 'forest', '2': 'desert', '3': 'wetland', '4': 'lake', '5': 'snow hatch', '6': 'bayou'},
    'color': {'file': 'textures/kiros_region_color_8k.jpg', 'size': [int(i1 - i0), int(j1 - j0)]},
    'ocean_globe': {'file': 'textures/kiros_ocean_2k.png', 'size': [2048, 1024]},
    'max_land_m': float(np.max(e[land])), 'min_ocean_m': float(np.min(e))
}
json.dump(meta, open(os.path.join(DATA, 'kiros_meta.json'), 'w'), indent=1)
print('region', rw, rh, 'window', i0, j0, i1, j1, 'max land', meta['web']['max_land_m'])
for f in ['kiros_region_height16_4k.png', 'kiros_region_mask_4k.png', 'kiros_region_color_8k.jpg', 'kiros_ocean_2k.png']:
    print(f, os.path.getsize(os.path.join(TEX, f)) // 1024, 'KB')
