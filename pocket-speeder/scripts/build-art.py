# Downloads official artwork for every card and saves a small webp to public/art/.
import io, json, pathlib, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'public' / 'art'
out.mkdir(parents=True, exist_ok=True)
cards = json.loads((root / 'src' / 'cards.json').read_text(encoding='utf-8'))
URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{}.png'

# Alternate forms picked by the card above: Arceus plates, Silvally memories, Mega Golisopod on steel.
cards += [{'id': f'{name}-{t}', 'pid': f'{pid}-{t}'} for name, pid in (('arceus', 493), ('silvally', 773)) for t in ('dragon', 'ghost', 'water', 'steel')]
cards += [{'id': 'golisopod-mega', 'pid': 10316}]

def fetch(c):
    dest = out / f"{c['id']}.webp"
    if dest.exists():
        return
    im = Image.open(io.BytesIO(urllib.request.urlopen(URL.format(c['pid'])).read())).convert('RGBA')
    im = im.crop(im.getbbox())
    im.thumbnail((200, 200), Image.LANCZOS)
    im.save(dest, 'WEBP', quality=86, method=6)

with ThreadPoolExecutor(8) as ex:
    list(ex.map(fetch, cards))
print(len(list(out.glob('*.webp'))), 'files')
