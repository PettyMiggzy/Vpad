import base64, io, json, numpy as np
from PIL import Image
from cutlib import cut
W={}; META={}
for t in ('lime','pink'):
    for k in ('pistol','smg','rifle','shotgun','sniper'):
        n=f'{k}_{t}'; cut(n+'.png',n+'_s.png',size=(320,320))
        im=Image.open(n+'_s.png'); bb=im.getbbox(); im=im.crop(bb)
        b=io.BytesIO(); im.save(b,'WEBP',quality=82,method=6); W[n]='data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode(); META[n]=[im.width,im.height]
        print(n,im.size,len(b.getvalue()))
VM={}; VMETA={}
for t in ('lime','pink'):
    for k in ('pistol','smg','rifle','shotgun','sniper'):
        n=f'vm_{k}_{t}'; cut(n+'.png',n+'_s.png',size=(560,420))
        im=Image.open(n+'_s.png'); bb=im.getbbox(); im=im.crop(bb)
        a=np.array(im.getchannel('A'))>40; ys,xs=np.nonzero(a); top=ys.min(); tipx=xs[ys<=top+6].mean()
        b=io.BytesIO(); im.save(b,'WEBP',quality=80,method=6); VM[n]='data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
        VMETA[n]=[im.width,im.height,round(float(tipx)/im.width,3)]
        print(n,im.size,len(b.getvalue()),VMETA[n])
src="// Generated art: the meme soldiers (one per weapon, a lime and a pink team) and the first-person hands and guns, cut out and embedded so the game needs no hosting.\n"
src+="export const UNIT: Record<string, string> = "+json.dumps(W)+";\n"
src+="export const UNIT_SIZE: Record<string, [number, number]> = "+json.dumps(META)+";\n"
src+="export const HELD: Record<string, string> = "+json.dumps(VM)+";\n"
src+="export const HELD_SIZE: Record<string, [number, number, number]> = "+json.dumps(VMETA)+";\n"
open('/tmp/claude-0/fps/src/art.ts','w').write(src); print(len(src))
# contact sheet of viewmodels
sheet=Image.new('RGBA',(2800,420),(60,70,60,255))
for i,k in enumerate(('pistol','smg','rifle','shotgun','sniper')):
    im=Image.open(f'vm_{k}_pink_s.png'); sheet.paste(im,(i*560,0),im)
sheet.convert('RGB').resize((1400,210)).save('vmcut.jpg',quality=80)
