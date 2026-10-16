import json,sys,base64,urllib.request
KEY=__import__('os').environ['VENICE_API_KEY']
def gen(name,prompt,model='flux-2-pro',w=768,h=1024):
    body=json.dumps({"model":model,"prompt":prompt,"width":w,"height":h,"format":"png","safe_mode":False,"hide_watermark":True,"return_binary":False}).encode()
    r=urllib.request.Request('https://api.venice.ai/api/v1/image/generate',body,{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'})
    d=json.load(urllib.request.urlopen(r,timeout=240))
    open(f'{name}.png','wb').write(base64.b64decode(d['images'][0])); print('ok',name)
STYLE=("full body, standing facing the viewer, centred, whole character visible head to feet, thick clean black outlines, bold cartoon mascot game art, detailed tactical armour in dark charcoal and black with {acc} glowing accents, "
"flat solid pure {bg} background, no ground, no shadow, no text")
CH={'pistol':"a tough frog soldier in a tactical helmet and vest, holding a pistol in one hand aimed forward",
'smg':"a sneaky raccoon soldier with a black mask, tactical vest, holding a compact submachine gun with both hands aimed forward",
'rifle':"a stocky grey bulldog soldier in a combat helmet and heavy vest, holding an assault rifle with both hands aimed forward",
'shotgun':"an angry crocodile soldier in armour, holding a pump shotgun with both hands aimed forward",
'sniper':"a hooded ape soldier in a dark cloak, holding a long sniper rifle with a scope aimed forward"}
if __name__=='__main__':
    which=sys.argv[1:]
    for w in which:
        k,t=w.split(':')
        gen(f'{k}_{t}',CH[k]+', '+STYLE.format(acc='neon lime green' if t=='lime' else 'hot neon pink', bg='magenta #ff00ff' if t=='lime' else 'cyan #00ffff'))
