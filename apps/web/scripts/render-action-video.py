"""Turn a verified browser recording into a captioned, silent H.264 walkthrough.

Requires Pillow plus an ffmpeg binary (FFMPEG_BIN=... or on PATH). All website
frames come from real Playwright browser capture; the only additions are
intro/outro cards, browser framing and honest chapter captions.
"""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
CAPTURE = Path(os.getenv("AGENTLAB_CAPTURE_DIR", ROOT / ".data/action-capture"))
OUTPUT = Path(os.getenv("AGENTLAB_VIDEO_OUT", ROOT.parent / "AGENTLAB-action-demo.mp4"))
FFMPEG = os.getenv("FFMPEG_BIN") or shutil.which("ffmpeg")
if not FFMPEG:
    raise SystemExit("Install ffmpeg (or set FFMPEG_BIN) before rendering")
SOURCE = CAPTURE / "website-actions.webm"
CHAPTERS = json.loads((CAPTURE / "chapters.json").read_text())
EVIDENCE = json.loads((CAPTURE / "verified-evidence.json").read_text())
if not SOURCE.exists() or not CHAPTERS or not EVIDENCE.get("report_id"):
    raise SystemExit("Browser capture is incomplete or lacks verified evidence")
FRAMESIZE = (1920, 1080)
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def font(size, bold=False, mono=False):
    return ImageFont.truetype(BOLD if bold else MONO if mono else REGULAR, size)


def background():
    """Subtle handcrafted research-lab slate with mint light and precision grid."""
    image = Image.new("RGB", FRAMESIZE, "#08131a")
    base = ImageDraw.Draw(image)
    for y in range(1080):
        ratio = y / 1080
        base.line([(0, y), (1920, y)], fill=(int(9 + 4 * ratio), int(24 - 7 * ratio), int(28 - 6 * ratio)))
    light = Image.new("RGBA", FRAMESIZE)
    ldraw = ImageDraw.Draw(light)
    ldraw.ellipse((-380, -580, 1350, 940), fill=(63, 233, 161, 58))
    light = light.filter(ImageFilter.GaussianBlur(230))
    image = Image.alpha_composite(image.convert("RGBA"), light)
    draw = ImageDraw.Draw(image, "RGBA")
    for x in range(0, 1920, 92):
        draw.line([(x, 0), (x, 1080)], fill=(100, 169, 153, 15), width=1)
    for y in range(0, 1080, 92):
        draw.line([(0, y), (1920, y)], fill=(100, 169, 153, 15), width=1)
    draw.line([(125, 128), (1795, 128)], fill=(104, 230, 176, 110), width=2)
    draw.line([(125, 944), (1795, 944)], fill=(95, 154, 137, 72), width=1)
    draw.rounded_rectangle((124, 70, 176, 119), radius=10, fill=(34, 110, 82, 255))
    draw.polygon([(141, 102), (152, 83), (163, 102), (155, 102), (152, 95), (149, 102)], fill=(184, 255, 211, 255))
    draw.text((193, 79), "AGENTLAB", font=font(27, bold=True), fill="#e9faf0")
    draw.text((124, 979), "T E S T   ·   O B S E R V E   ·   B R E A K   ·   I M P R O V E", font=font(19, mono=True), fill="#8eada6")
    draw.text((1390, 81), "RESEARCH / RECORDED DEMO", font=font(16, mono=True), fill="#8aafa0")
    return image, draw


intro, draw = background()
draw.text((120, 205), "Reliability,", font=font(106, bold=True), fill="#f0fbf4")
draw.text((120, 324), "under a microscope.", font=font(83, bold=True), fill="#86e8bd")
draw.text((125, 482), "An evidence-first website walkthrough — recorded live.", font=font(33), fill="#d0e8e0")
draw.text((125, 541), "Real mock executions.  Versioned experiments.  Observable failures.", font=font(24), fill="#94ada6")
draw.rounded_rectangle((124, 616, 611, 664), radius=8, fill=(64, 49, 26, 225), outline="#ad8d55", width=2)
draw.text((142, 628), "DEMO / SYNTHETIC FIXTURE", font=font(20, mono=True), fill="#e6c07f")
draw.text((125, 699), "NO PRESEEDED RESULTS.   NO REAL-MODEL CAPABILITY CLAIMS.", font=font(18, mono=True), fill="#a8cab9")
for x, label in zip((125, 547, 969, 1391), ("01   EXECUTE", "02   DIAGNOSE", "03   STRESS", "04   EXPORT")):
    draw.rounded_rectangle((x, 819, x + 365, 882), radius=6, fill=(15, 36, 40, 255), outline=(84, 146, 121, 142), width=2)
    draw.text((x + 18, 838), label, font=font(17, mono=True), fill="#a5d9c2")
intro.convert("RGB").save(CAPTURE / "intro.png")

outro, draw = background()
draw.text((123, 206), "Evidence,", font=font(109, bold=True), fill="#f0fbf4")
draw.text((123, 333), "not intuition.", font=font(98, bold=True), fill="#83e4bb")
draw.text((127, 526), "The video shows real browser actions and executed DEMO mock runs.", font=font(30), fill="#d1e9e0")
draw.text((127, 587), "Traces, comparisons and PDF snapshots remain linked to their source IDs.", font=font(25), fill="#9fb9b0")
draw.rounded_rectangle((125, 687, 1464, 779), radius=9, fill=(20, 40, 39, 255), outline=(72, 130, 104, 170), width=2)
draw.text((147, 707), "MODEL CAPABILITY / NOT MEASURED", font=font(23, mono=True), fill="#ffcf87")
draw.text((147, 742), "PROVIDER COST / NOT MEASURED", font=font(23, mono=True), fill="#ffcf87")
draw.text((124, 863), "EXPLORE THE AGENTLAB SOURCE AND YOUR OWN VERSIONED EXPERIMENTS.", font=font(19, mono=True), fill="#acc8b7")
outro.convert("RGB").save(CAPTURE / "outro.png")

probe = subprocess.run([FFMPEG, "-hide_banner", "-i", str(SOURCE)], capture_output=True, text=True, check=False)
match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", probe.stderr)
if not match:
    raise SystemExit("Could not establish video duration")
duration = int(match[1]) * 3600 + int(match[2]) * 60 + float(match[3])
if duration < CHAPTERS[-1]["at"] + 1:
    raise SystemExit("Raw recording ends before the final chapter")

# Header lettering is drawn into a tiny transparent PNG because the portable
# ffmpeg binary need not include libfreetype/drawtext. ASS (libass) places
# chapter captions in the footer without touching the real browser frames.
header = Image.new("RGBA", (1920, 72))
h = ImageDraw.Draw(header)
h.ellipse((160, 26, 171, 37), fill="#6df3b5")
h.text((186, 17), "AGENTLAB", font=font(27, bold=True), fill="#e2f8ec")
h.text((1210, 24), "REAL BROWSER CAPTURE  /  DEMO MOCK EXECUTIONS", font=font(16, mono=True), fill="#8abda5")
header.save(CAPTURE / "video-header.png")

ass_lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "ScaledBorderAndShadow: yes",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Title,DejaVu Sans,21,&H00BBEC81,&H00BBEC81,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "Style: Detail,DejaVu Sans,19,&H00D2DCC7,&H00D2DCC7,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
]

def ass_time(seconds):
    ticks = round(seconds * 100)
    return f"{ticks // 360000}:{ticks // 6000 % 60:02}:{ticks // 100 % 60:02}.{ticks % 100:02}"

subtitles = []
for i, item in enumerate(CHAPTERS):
    start = max(0.0, item["at"] - 0.05)
    end = CHAPTERS[i + 1]["at"] - 0.05 if i + 1 < len(CHAPTERS) else duration + 1
    subtitles.append((start + 3, end + 3, f"{item['title']}\n{item['description']}"))
    for style, y, text in (("Title", 999, item["title"]), ("Detail", 1032, item["description"])):
        safe_text = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        ass_lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{{\\pos(160,{y})}}{safe_text}")
(CAPTURE / "chapters.ass").write_text("\n".join(ass_lines) + "\n")

filters = [
    "[0:v]fps=25,scale=1600:900:flags=lanczos,",
    "pad=1920:1080:160:78:color=0x09151c,",
    "drawbox=x=159:y=77:w=1602:h=902:color=0x456058:t=2,",
    "drawbox=x=0:y=0:w=1920:h=72:color=0x0e2227:t=fill,",
    "drawbox=x=0:y=986:w=1920:h=94:color=0x0e2227:t=fill,",
    "drawbox=x=160:y=985:w=1600:h=1:color=0x557667:t=fill,",
    "format=rgba[stage];",
    "[3:v]format=rgba[header];",
    "[stage][header]overlay=0:0:shortest=1,",
    f"ass=filename={CAPTURE / 'chapters.ass'},format=yuv420p[website];",
    "[1:v]fps=25,format=yuv420p[intro];[2:v]fps=25,format=yuv420p[outro];",
    "[intro][website][outro]concat=n=3:v=1:a=0[final]",
]


def timestamp(seconds):
    millis = int(seconds * 1000)
    return f"{millis // 3600000:02}:{millis // 60000 % 60:02}:{millis // 1000 % 60:02}.{millis % 1000:03}"

captions_vtt = "WEBVTT\n\n" + "\n\n".join(
    f"{timestamp(start)} --> {timestamp(end)}\n{text}" for start, end, text in subtitles
) + "\n"
OUTPUT.with_suffix(".vtt").write_text(captions_vtt)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
command = [
    FFMPEG, "-hide_banner", "-y", "-i", str(SOURCE),
    "-loop", "1", "-framerate", "25", "-t", "3", "-i", str(CAPTURE / "intro.png"),
    "-loop", "1", "-framerate", "25", "-t", "4", "-i", str(CAPTURE / "outro.png"),
    "-loop", "1", "-framerate", "25", "-i", str(CAPTURE / "video-header.png"),
    "-filter_complex", "".join(filters), "-map", "[final]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an",
    "-metadata", "title=AGENTLAB | Website in Action (DEMO)",
    "-metadata", "comment=Real browser recording of deterministic synthetic mock executions; not real model capability claims.",
    str(OUTPUT),
]
print("Encoding", OUTPUT, "from", round(duration, 2), "seconds of verified browser actions")
subprocess.run(command, check=True)
print("Wrote", OUTPUT, "and", OUTPUT.with_suffix(".vtt"))
