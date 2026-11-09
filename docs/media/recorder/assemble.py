"""Turns recorded screencast frames into a GIF: crop, merge repeats, cap long pauses, 256-color palette."""
import json, sys
from pathlib import Path
from PIL import Image, ImageChops

def build(frameDir, outPath, maxHold=1400, minStep=90, scale=1.0):
    folder = Path(frameDir)
    meta = json.loads((folder / "meta.json").read_text())
    crop = meta["crop"]
    box = (crop["x"], crop["y"], crop["x"] + crop["width"], crop["y"] + crop["height"])
    frames, durations, last, lastTime = [], [], None, None
    for entry in meta["frames"]:
        image = Image.open(folder / entry["name"]).convert("RGB").crop(box)
        if scale != 1.0:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        time = entry["t"] * 1000
        if last is not None:
            gap = time - lastTime
            if gap < minStep or ImageChops.difference(image, last).getbbox() is None:
                continue
            durations[-1] = min(gap, maxHold)
        frames.append(image)
        durations.append(100)
        last, lastTime = image, time
    durations[-1] = meta["holdEndMs"]
    # One palette for the whole GIF (built from frames across the clip), so unchanged pixels stay identical
    # between frames and each frame only stores the region that changed
    samples = frames[:: max(1, len(frames) // 12)]
    sheet = Image.new("RGB", (frames[0].width, frames[0].height * len(samples)))
    for index, sample in enumerate(samples):
        sheet.paste(sample, (0, frames[0].height * index))
    palette = sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    paletted = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    paletted[0].save(outPath, save_all=True, append_images=paletted[1:], duration=[int(d) for d in durations], loop=0, optimize=True, disposal=1)
    size = Path(outPath).stat().st_size
    print(f"{outPath}: {len(frames)} frames, {sum(durations)/1000:.1f}s, {size/1e6:.2f} MB, {frames[0].width}x{frames[0].height}")

if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], scale=float(sys.argv[3]) if len(sys.argv) > 3 else 1.0)
