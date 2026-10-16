import base64, io, json, numpy as np
from PIL import Image
from cutlib import cut
def webp(im,q=80):
    b=io.BytesIO(); im.save(b,'WEBP',quality=q,method=6); return 'data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode(), len(b.getvalue())
TEX={}
for k in ('t_floor','t_wall','t_metal','t_pad','t_crate'):
    im=Image.open(k+'.png').convert('RGB'); w,h=im.size; m=int(w*0.07)
    im=im.crop((m,m,w-m,h-m)).resize((512,512),Image.LANCZOS)   # drop the edge where a watermark sits
    if k!='t_crate':   # mirror tiling makes it seamless by construction
        t=Image.new('RGB',(1024,1024)); t.paste(im,(0,0)); t.paste(im.transpose(Image.FLIP_LEFT_RIGHT),(512,0)); t.paste(im.transpose(Image.FLIP_TOP_BOTTOM),(0,512)); t.paste(im.transpose(Image.ROTATE_180),(512,512)); im=t.resize((512,512),Image.LANCZOS)
    TEX[k],n=webp(im,78); print(k,n)
cut('skyline.png','skyline_cut.png',size=(1280,448))
sky=Image.open('skyline_cut.png'); sky=sky.crop(sky.getbbox())
SKY,n=webp(sky,80); print('sky',sky.size,n)
src="// Generated art for the arena: surface textures (made seamless) and a distant skyline.\n"
src+="export const TEX: Record<string, string> = "+json.dumps(TEX)+";\n"
src+="export const SKYLINE = "+json.dumps(SKY)+";\nexport const SKYLINE_ASPECT = "+str(round(sky.width/sky.height,3))+";\n"
open('/tmp/claude-0/fps/src/art2.ts','w').write(src); print(len(src))
sky.convert('RGBA').save('skyview.png')
