"""Run the whole pipeline: masks -> register -> project -> terrain -> render -> export_web.
Usage:  python pipeline/run_all.py        (needs: pip install -r pipeline/requirements.txt)"""
import runpy, sys, os, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
for step in ['masks', 'register', 'project', 'terrain', 'render', 'export_web']:
    t0 = time.time(); print(f'=== {step}')
    runpy.run_path(os.path.join(HERE, step + '.py'), run_name='__main__')
    print(f'    {time.time() - t0:.1f}s')
