"""Step 2: register the biome map (kiros_v5) onto the outline's pixel grid by feature matching."""
import numpy as np, cv2
from common import OUTLINE, BIOME, build

ref = cv2.imread(OUTLINE, cv2.IMREAD_GRAYSCALE)
col = cv2.imread(BIOME, cv2.IMREAD_UNCHANGED)[..., :3]
mov = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY)
orb = cv2.ORB_create(8000)
k1, d1 = orb.detectAndCompute(mov, None); k2, d2 = orb.detectAndCompute(ref, None)
m = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
m = sorted(m, key=lambda x: x.distance)[:1500]
srcp = np.float32([k1[x.queryIdx].pt for x in m]); dstp = np.float32([k2[x.trainIdx].pt for x in m])
Hm, inl = cv2.findHomography(srcp, dstp, cv2.RANSAC, 4.0)
print('inliers', int(inl.sum()), 'of', len(m)); print(np.round(Hm, 4))
warp = cv2.warpPerspective(col, Hm, (ref.shape[1], ref.shape[0]), borderValue=(220, 225, 230))
cv2.imwrite(build('biome_reg.png'), warp)
ov = warp.copy(); ov[ref < 140] = (0, 0, 255); cv2.imwrite(build('biome_reg_check.png'), ov)
