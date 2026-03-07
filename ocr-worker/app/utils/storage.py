import io
import boto3
from botocore.config import Config
from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def download_file(s3_path: str) -> bytes:
    """Download file from S3. s3_path format: bucket/key"""
    client = get_s3_client()
    parts = s3_path.split("/", 1)
    bucket, key = parts[0], parts[1]
    response = client.get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


def upload_file(bucket: str, key: str, data: bytes, content_type: str = "image/png") -> str:
    client = get_s3_client()
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    return f"{bucket}/{key}"
