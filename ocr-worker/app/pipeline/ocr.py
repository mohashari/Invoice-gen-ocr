"""
Tesseract 5 OCR engine integration.
Uses LSTM (--oem 1) with configurable PSM modes.
Extracts raw text and per-word confidence scores.
"""

import pytesseract
from PIL import Image
import numpy as np
from typing import Optional


# Tesseract OEM: 1 = LSTM neural network only (Tesseract 5)
OEM_LSTM = 1

# PSM modes used:
#   3  = Fully automatic page segmentation (default)
#   6  = Assume a single uniform block of text
#   11 = Sparse text — find as much text as possible (good for invoices)
PSM_AUTO = 3
PSM_BLOCK = 6
PSM_SPARSE = 11


def run_ocr(
    image: np.ndarray,
    lang: str = "eng+ind",
    psm: int = PSM_SPARSE,
) -> dict:
    """
    Run Tesseract 5 on a preprocessed image.
    Returns:
        {
          "text": str,              # full raw OCR text
          "confidence": float,      # average word confidence 0-100
          "words": list[dict]       # per-word data with bounding boxes
        }
    """
    pil_img = Image.fromarray(image)
    config = f"--oem {OEM_LSTM} --psm {psm}"

    # Full text
    raw_text = pytesseract.image_to_string(pil_img, lang=lang, config=config)

    # Per-word data including confidence
    data = pytesseract.image_to_data(
        pil_img,
        lang=lang,
        config=config,
        output_type=pytesseract.Output.DICT,
    )

    words = []
    confidences = []
    for i in range(len(data["text"])):
        word = data["text"][i].strip()
        conf = int(data["conf"][i])
        if word and conf > 0:
            words.append({
                "text": word,
                "confidence": conf,
                "left": data["left"][i],
                "top": data["top"][i],
                "width": data["width"][i],
                "height": data["height"][i],
            })
            confidences.append(conf)

    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "text": raw_text,
        "confidence": round(avg_confidence, 2),
        "words": words,
    }


def run_ocr_multi_psm(image: np.ndarray, lang: str = "eng+ind") -> dict:
    """
    Try multiple PSM modes and return the result with highest confidence.
    Useful for invoices with mixed layouts.
    """
    best = {"confidence": -1}
    for psm in [PSM_SPARSE, PSM_AUTO, PSM_BLOCK]:
        result = run_ocr(image, lang=lang, psm=psm)
        if result["confidence"] > best["confidence"]:
            best = result
    return best
