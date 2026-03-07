"""
Image preprocessing pipeline for Tesseract 5 OCR.
Steps: grayscale → deskew → denoise → contrast enhancement → binarize
"""

import io
import math
import cv2
import numpy as np
from PIL import Image


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Full preprocessing pipeline. Returns BGR numpy array ready for OCR."""
    img = _bytes_to_cv2(image_bytes)
    img = _to_grayscale(img)
    img = _deskew(img)
    img = _denoise(img)
    img = _enhance_contrast(img)
    img = _binarize(img)
    return img


def _bytes_to_cv2(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    return img


def _to_grayscale(img: np.ndarray) -> np.ndarray:
    if len(img.shape) == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img


def _deskew(img: np.ndarray) -> np.ndarray:
    """Correct skew using Hough lines. Only corrects small angles (-15..+15 deg)."""
    edges = cv2.Canny(img, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100,
                             minLineLength=img.shape[1] // 4, maxLineGap=20)
    if lines is None:
        return img

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 != x1:
            angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
            # Only consider near-horizontal lines
            if -15 < angle < 15:
                angles.append(angle)

    if not angles:
        return img

    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.3:
        return img

    (h, w) = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    return cv2.warpAffine(img, M, (w, h),
                          flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def _denoise(img: np.ndarray) -> np.ndarray:
    return cv2.fastNlMeansDenoising(img, h=10, templateWindowSize=7, searchWindowSize=21)


def _enhance_contrast(img: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(img)


def _binarize(img: np.ndarray) -> np.ndarray:
    """Adaptive thresholding for variable lighting conditions."""
    return cv2.adaptiveThreshold(
        img, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11, 2,
    )


def cv2_to_pil(img: np.ndarray) -> Image.Image:
    return Image.fromarray(img)


def pil_to_bytes(pil_img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    pil_img.save(buf, format=fmt)
    return buf.getvalue()
