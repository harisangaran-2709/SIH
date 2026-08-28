import sys
sys.path.insert(0, '.')
from PIL import Image
from service.detection.engine import paddle_engine

img = Image.open('test-images/front.jpg').convert('RGB')
res = paddle_engine.process_image(img, 'front')
print('Image ID:', res.image_id)
print('Size:', res.width, 'x', res.height)
print('Time:', res.processing_time_ms, 'ms')
print('Detections:', len(res.detections))
for d in res.detections:
    print('  - %r (conf=%.2f) bbox=%s' % (d.text, d.confidence, d.bounding_box[:2]))
print('Success!')
