import numpy as np, sys
from PIL import Image
from collections import deque
def cut(path,out,size=(384,384)):
    im=Image.open(path).convert('RGB'); a=np.array(im).astype(np.int32)
    h,w,_=a.shape
    key=np.median(np.concatenate([a[:6].reshape(-1,3),a[-6:].reshape(-1,3),a[:,:6].reshape(-1,3),a[:,-6:].reshape(-1,3)]),axis=0)
    d=np.sqrt(((a-key)**2).sum(2))
    r,g,b=a[...,0],a[...,1],a[...,2]
    if key[0]>150 and key[2]>100 and key[1]<120: cand=(d<70)|((r-g>90)&(b-g>40))   # magenta ground, its shadow included
    else: cand=(d<70)|((b-r>90)&(g-r>90))                                           # cyan ground
    # flood from the border through candidate pixels only
    seen=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if cand[y,x] and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if cand[y,x] and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and cand[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; q.append((ny,nx))
    alpha=np.where(seen,0,255).astype(np.uint8)
    # soft edge: pixels next to background get partial alpha by key distance
    from PIL import ImageFilter
    am=Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.0))
    rgba=np.dstack([a.astype(np.uint8),np.array(am)])
    # despill: where alpha<255 near key, darken toward outline colour
    # the generator draws a pale sticker rim round some characters: drop near-white pixels that touch the background
    sol=rgba[...,3]>128
    for _ in range(10):
        edge=sol&~np.pad(sol,1)[1:-1,2:]|sol&~np.pad(sol,1)[1:-1,:-2]|sol&~np.pad(sol,1)[2:,1:-1]|sol&~np.pad(sol,1)[:-2,1:-1]
        white=(rgba[...,:3].min(2)>205)
        kill=edge&white
        rgba[kill,3]=0; sol=rgba[...,3]>128
    soft=(rgba[...,3]<250)&(rgba[...,3]>0)
    rgba[soft,:3]=(rgba[soft,:3]*0.35).astype(np.uint8)
    img=Image.fromarray(rgba,'RGBA')
    bb=img.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox()
    img=img.crop(bb)
    # fit into size keeping aspect, bottom-centre
    s=min(size[0]/img.width,size[1]/img.height); img=img.resize((max(1,int(img.width*s)),max(1,int(img.height*s))),Image.LANCZOS)
    c=Image.new('RGBA',size,(0,0,0,0)); c.paste(img,((size[0]-img.width)//2,size[1]-img.height),img)
    c.save(out); return img.size
