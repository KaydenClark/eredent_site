"""Step 3: sphere placement. The drawn map is a top-down (azimuthal equidistant) view of the cluster.
The spec states the placement (center 37.2 N, 0.076 deg per outline pixel); this step records it and
reports where the anchors land so a change to either number is visible immediately."""
import numpy as np
from common import CFG, build, latlon_from_px

P = CFG['placement']
x0, y0 = P['center_px_outline']
c, k = P['center_lat_deg'], P['deg_per_outline_px']
A = P['anchors_check']
print('center lat', c, 'deg/px', k)
for name, p in [('Fiira tip (canon 0)', A['fiira_south_tip_px']), ('top island (proposed 75)', A['northernmost_island_px']),
                ('Malos tip', (877, 1057)), ('Lake Veir', (425, 395)), ('Sfere', (871, 393)), ('Dire Lake', (1100, 776)),
                ('Dragon volcano', (370, 850)), ('Ender', (90, 560)), ('W edge', (20, 552)), ('E edge', (1335, 552))]:
    la, lo = latlon_from_px(*p, x0, y0, c, k); print(f'{name:26s} lat {la:6.1f}  lon {lo:7.1f}')
np.save(build('proj.npy'), np.array([x0, y0, c, k]))
