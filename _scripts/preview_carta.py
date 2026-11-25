import json,sys,math
from PIL import Image,ImageDraw
gj,out=sys.argv[1],sys.argv[2]; W,S,E,N=map(float,sys.argv[3:7])
def merc(lat): return math.log(math.tan(math.pi/4+math.radians(lat)/2))
px=1400; sx=px/(E-W); py=int((merc(N)-merc(S))/math.radians(1)*sx)
def P(lon,lat): return ((lon-W)*sx, (merc(N)-merc(lat))/math.radians(1)*sx)
col={'tierra':(242,232,109),'seca':(156,207,107),'agua':(120,200,235),'profunda':(235,246,251)}
im=Image.new('RGB',(px,py),(200,200,200)); d=ImageDraw.Draw(im)
for z in ['agua','profunda','seca','tierra']:
  for f in json.load(open(gj))['features']:
    if f['properties']['z']!=z: continue
    g=f['geometry']; polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
    for p in polys:
      d.polygon([P(*c) for c in p[0]],fill=col[z])
      for h in p[1:]: d.polygon([P(*c) for c in h],fill=col['agua'] if z!='agua' else col['tierra'])
for b in json.load(open('datos/boyas_unen.json'))['boyas']:
  x,y=P(b['lon'],b['lat']); t=(b.get('funcType') or '')+b['name']
  c=(220,30,30) if 'ROJ' in t.upper() else (20,150,40) if 'VERD' in t.upper() else (30,30,30)
  d.ellipse([x-4,y-4,x+4,y+4],fill=c,outline=(0,0,0))
im.save(out); print(im.size)
