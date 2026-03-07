"""
OCR Worker — consumes BullMQ jobs from Redis queue.
Each job: download file from S3 → preprocess → Tesseract OCR → extract fields → callback API
"""

import io
import json
import logging
import time
import traceback

import httpx
import redis
from pdf2image import convert_from_bytes

from app.config import settings
from app.pipeline.preprocess import preprocess_image, cv2_to_pil, pil_to_bytes
from app.pipeline.ocr import run_ocr_multi_psm
from app.pipeline.extract import extract_invoice_fields, extract_line_items
from app.utils.storage import download_file, upload_file

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

QUEUE_NAME = "bull:ocr-jobs"
PROCESSING_KEY = "bull:ocr-jobs:active"


def get_redis():
    return redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        decode_responses=True,
    )


def send_callback(payload: dict):
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(settings.ocr_worker_callback_url, json=payload)
            resp.raise_for_status()
            log.info(f"Callback sent for invoice {payload['invoiceId']}: {resp.status_code}")
    except Exception as e:
        log.error(f"Callback failed for invoice {payload.get('invoiceId')}: {e}")


def process_pdf(file_bytes: bytes) -> list:
    """Convert PDF pages to images and return list of image bytes."""
    images = convert_from_bytes(file_bytes, dpi=300, fmt="png")
    results = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        results.append(buf.getvalue())
    return results


def process_job(job_data: dict):
    invoice_id = job_data.get("invoiceId")
    raw_file_url = job_data.get("rawFileUrl")
    mime_type = job_data.get("mimeType", "image/jpeg")

    log.info(f"Processing invoice {invoice_id}, file: {raw_file_url}")

    try:
        # 1. Download from S3/MinIO
        file_bytes = download_file(raw_file_url)

        # 2. Handle PDF: convert to images first
        if mime_type == "application/pdf":
            image_pages = process_pdf(file_bytes)
        else:
            image_pages = [file_bytes]

        all_text = []
        all_confidence = []

        for page_idx, img_bytes in enumerate(image_pages):
            # 3. Preprocess image
            preprocessed = preprocess_image(img_bytes)

            # 4. Save preprocessed image to S3 for debugging
            pil_img = cv2_to_pil(preprocessed)
            processed_bytes = pil_to_bytes(pil_img)
            upload_file(
                settings.s3_bucket_processed,
                f"{invoice_id}/page_{page_idx}.png",
                processed_bytes,
                "image/png",
            )

            # 5. Run Tesseract 5 OCR
            ocr_result = run_ocr_multi_psm(preprocessed, lang="eng+ind")
            all_text.append(ocr_result["text"])
            all_confidence.append(ocr_result["confidence"])
            log.info(
                f"Page {page_idx}: confidence={ocr_result['confidence']:.1f}%, "
                f"text_length={len(ocr_result['text'])}"
            )

        # 6. Combine text from all pages
        combined_text = "\n\n".join(all_text)
        avg_confidence = sum(all_confidence) / len(all_confidence) if all_confidence else 0

        # 7. Extract structured fields
        invoice_data = extract_invoice_fields(combined_text)
        invoice_data["rawOcrText"] = combined_text
        line_items = extract_line_items(combined_text)

        log.info(
            f"Extraction complete for {invoice_id}: "
            f"confidence={avg_confidence:.1f}%, fields={list(k for k,v in invoice_data.items() if v)}"
        )

        # 8. Send callback to API
        send_callback({
            "invoiceId": invoice_id,
            "status": "done",
            "confidence": round(avg_confidence, 2),
            "invoiceData": invoice_data,
            "lineItems": line_items,
        })

    except Exception as e:
        log.error(f"Failed to process invoice {invoice_id}: {e}\n{traceback.format_exc()}")
        send_callback({
            "invoiceId": invoice_id,
            "status": "failed",
            "errorMsg": str(e),
        })


def poll_queue(r: redis.Redis):
    """
    Poll BullMQ-compatible Redis queue for jobs.
    BullMQ stores jobs in a sorted set: bull:{queue}:wait
    """
    wait_key = f"bull:ocr-jobs:wait"
    active_key = f"bull:ocr-jobs:active"

    while True:
        try:
            # Atomically move job from wait to active
            job_id = r.lmove(wait_key, active_key, "LEFT", "RIGHT")

            if not job_id:
                time.sleep(1)
                continue

            log.info(f"Dequeued job ID: {job_id}")

            # Get job data
            job_key = f"bull:ocr-jobs:{job_id}"
            raw = r.hget(job_key, "data")

            if not raw:
                log.warning(f"No data for job {job_id}, skipping")
                r.lrem(active_key, 1, job_id)
                continue

            job_data = json.loads(raw)
            process_job(job_data)

            # Remove from active queue
            r.lrem(active_key, 1, job_id)
            # Mark as completed in BullMQ
            completed_key = f"bull:ocr-jobs:completed"
            r.zadd(completed_key, {job_id: time.time()})

        except redis.exceptions.ConnectionError:
            log.error("Redis connection lost, retrying in 5s...")
            time.sleep(5)
        except Exception as e:
            log.error(f"Worker error: {e}\n{traceback.format_exc()}")
            time.sleep(2)


def main():
    log.info("OCR Worker starting...")
    log.info(f"Redis: {settings.redis_host}:{settings.redis_port}")
    log.info(f"Callback URL: {settings.ocr_worker_callback_url}")

    while True:
        try:
            r = get_redis()
            r.ping()
            log.info("Connected to Redis. Polling queue...")
            poll_queue(r)
        except redis.exceptions.ConnectionError:
            log.error("Cannot connect to Redis, retrying in 10s...")
            time.sleep(10)


if __name__ == "__main__":
    main()
