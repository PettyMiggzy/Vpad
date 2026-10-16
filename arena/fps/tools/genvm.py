import sys
from gen import gen
HAND={'pistol':("green frog hand with a black tactical glove","a pistol"),
'smg':("raccoon paws with black tactical gloves","a compact submachine gun"),
'rifle':("grey bulldog paws in tactical gloves","an assault rifle"),
'shotgun':("green crocodile claws in armoured gloves","a pump shotgun"),
'sniper':("brown ape hands in dark gloves, dark cloak sleeves","a long scoped sniper rifle")}
S=("first person shooter view model, {hand} gripping {gun}, the weapon pointing forward and slightly upward, seen from behind the weapon at the bottom right of the frame, forearms entering from the bottom edge, "
"dark charcoal tactical armour sleeves with {acc} glowing accents, thick clean black outlines, bold cartoon game art, no head, no body, flat solid pure {bg} background, no text")
for w in sys.argv[1:]:
    k,t=w.split(':'); h,g=HAND[k]
    gen(f'vm_{k}_{t}',S.format(hand=h,gun=g,acc='neon lime green' if t=='lime' else 'hot neon pink',bg='magenta #ff00ff' if t=='lime' else 'cyan #00ffff'),w=1024,h=768)
