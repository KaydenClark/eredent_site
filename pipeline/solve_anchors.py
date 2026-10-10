"""Reference only: least-squares fit of (center lat, deg/px) to the two anchors in config.json.
The anchors cannot both be met exactly; the spec's stated placement in config.json is what the build uses."""
import numpy as np
from scipy.optimize import least_squares
from common import CFG, latlon_from_px

P = CFG['placement']; A = P['anchors_check']; x0, y0 = P['center_px_outline']
f = lambda v: [float(latlon_from_px(*A['fiira_south_tip_px'], x0, y0, *v)[0] - A['fiira_south_tip_lat']),
               float(latlon_from_px(*A['northernmost_island_px'], x0, y0, *v)[0] - A['northernmost_island_lat'])]
r = least_squares(f, [38, 0.08], bounds=([0, 0.01], [80, 0.2]))
print('best fit center lat', round(float(r.x[0]), 2), 'deg/px', round(float(r.x[1]), 4), 'residuals (deg)', [round(x, 2) for x in f(r.x)])
print('spec placement residuals (deg)', [round(x, 2) for x in f([P['center_lat_deg'], P['deg_per_outline_px']])])
