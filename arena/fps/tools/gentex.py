from gen import gen
T={'t_floor':"seamless top-down texture of dark worn asphalt and concrete floor, fine cracks and subtle wear, uniform lighting, no objects, no perspective, game texture",
't_wall':"seamless texture of grey concrete wall panels with panel seams and bolts, light staining, uniform lighting, front view, no perspective, game texture",
't_crate':"seamless texture of a military wooden supply crate, planks with steel brackets and faded stencil marking, front view, uniform lighting, game texture",
't_metal':"seamless texture of dark charcoal corrugated steel shipping container wall with faint rust and scratches, front view, uniform lighting, game texture",
't_pad':"seamless top-down texture of dark sci-fi hexagon floor tiles with thin glowing lines, uniform lighting, no perspective, game texture"}
for k,p in T.items(): gen(k,p,w=1024,h=1024)
gen('skyline',"wide panoramic silhouette of a futuristic neon city skyline at dusk, dark towers with tiny glowing windows in lime green and pink, strong flat solid pure magenta #ff00ff background above, no sky detail, no ground, no text",w=1280,h=448)
