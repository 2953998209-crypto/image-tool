from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (800, 300), (255, 255, 255))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 36)
except Exception:
    font = ImageFont.load_default()
d.text((40, 40), "你好世界 Hello World 123", fill=(20, 20, 20), font=font)
d.text((40, 120), "OpenClaw 智能图片工具", fill=(200, 30, 30), font=font)
d.text((40, 200), "Replace any object easily", fill=(20, 80, 200), font=font)
img.save('test_sample.png')
print('saved', img.size)
