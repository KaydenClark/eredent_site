"""Run the whole pipeline: masks -> register -> project -> terrain -> render -> export_web.
Usage:  python pipeline/run_all.py        (needs: pip install -r pipeline/requirements.txt)
        python pipeline/run_all.py --variant oct10
            builds a variant from pipeline/config_oct10.json into pipeline/build_oct10/, public/textures/oct10/ and
            public/data/kiros_meta_oct10.json; the September outputs are not touched (see docs/oct10-variant.md)."""
import runpy, sys, os, time, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
if '--variant' in sys.argv:                       # must be set before common is imported
    os.environ['KIROS_VARIANT'] = sys.argv[sys.argv.index('--variant') + 1]
import common  # noqa: E402
reuse = common.CFG.get('variant', {}).get('biome_reg_from')
for step in ['masks', 'register', 'project', 'terrain', 'render', 'export_web']:
    t0 = time.time(); print(f'=== {step}')
    if step == 'register' and reuse:
        # the biome map (kiros_v5) registers onto the same outline grid in every variant: reuse that result
        shutil.copyfile(os.path.join(common.ROOT, reuse), common.build('biome_reg.png'))
        print('    reused', reuse)
        continue
    runpy.run_path(os.path.join(HERE, step + '.py'), run_name='__main__')
    print(f'    {time.time() - t0:.1f}s')
